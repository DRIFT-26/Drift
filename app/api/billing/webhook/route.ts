import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Lazy init so Vercel build/TS collection doesn't crash if env vars
 * aren't present at build time.
 */
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key);
}

export async function POST(req: Request) {
  const supabase = supabaseAdmin();
  const stripe = getStripe();

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { ok: false, error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 200 }
    );
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: `Webhook signature verification failed: ${err?.message ?? String(err)}`,
      },
      { status: 400 }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const businessId =
        session.metadata?.business_id ||
        (typeof session.client_reference_id === "string"
          ? session.client_reference_id
          : undefined);

      const plan = session.metadata?.plan ?? "standard";

      const customerId =
        typeof session.customer === "string" ? session.customer : null;

      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;

      if (businessId) {
        await supabase
          .from("businesses")
          .update({
            billing_status: "active",
            billing_plan: plan,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          })
          .eq("id", businessId);
      }

      if (
        plan === "founder_299" &&
        subscriptionId &&
        process.env.STRIPE_PRICE_FOUNDER_299 &&
        process.env.STRIPE_PRICE_STANDARD
      ) {
        try {
          const schedule = await stripe.subscriptionSchedules.create({
            from_subscription: subscriptionId,
          });

          const nowSec = Math.floor(Date.now() / 1000);
          const oneYearLaterSec = nowSec + 60 * 60 * 24 * 365;

          await stripe.subscriptionSchedules.update(schedule.id, {
            end_behavior: "release",
            phases: [
              {
                start_date: nowSec,
                end_date: oneYearLaterSec,
                items: [
                  {
                    price: process.env.STRIPE_PRICE_FOUNDER_299,
                    quantity: 1,
                  },
                ],
              },
              {
                start_date: oneYearLaterSec,
                items: [
                  {
                    price: process.env.STRIPE_PRICE_STANDARD,
                    quantity: 1,
                  },
                ],
              },
            ],
          });
        } catch (scheduleErr) {
          console.error("Failed to apply founder_299 schedule", scheduleErr);
        }
      }
    }

    if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_succeeded"
    ) {
      const invoice = event.data.object as Stripe.Invoice;

      const subscriptionId =
        typeof (invoice as any).subscription === "string"
          ? (invoice as any).subscription
          : null;

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const businessId =
          (sub.metadata?.business_id as string | undefined) || undefined;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        const plan =
          (sub.metadata?.plan as string | undefined) || "standard";

        if (businessId) {
          await supabase
            .from("businesses")
            .update({
              billing_status: "active",
              billing_plan: plan,
              stripe_customer_id: customerId,
              stripe_subscription_id: sub.id,
            })
            .eq("id", businessId);
        }
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;

      const subscriptionId =
        typeof (invoice as any).subscription === "string"
          ? (invoice as any).subscription
          : null;

      if (subscriptionId) {
        await supabase
          .from("businesses")
          .update({
            billing_status: "expired",
          })
          .eq("stripe_subscription_id", subscriptionId);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;

      await supabase
        .from("businesses")
        .update({
          billing_status: "canceled",
        })
        .eq("stripe_subscription_id", sub.id);
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e), event_type: event.type },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true });
}