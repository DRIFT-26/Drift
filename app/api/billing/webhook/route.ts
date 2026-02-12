import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const supabase = supabaseAdmin();

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: `Webhook signature verification failed: ${err?.message ?? String(err)}` },
      { status: 400 }
    );
  }

  try {
    // 1) Checkout completed => mark paid and store ids
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const businessId = session.metadata?.business_id;
      const customerId = typeof session.customer === "string" ? session.customer : null;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;

      if (businessId) {
        await supabase
          .from("businesses")
          .update({
            is_paid: true,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          })
          .eq("id", businessId);
      }
    }

    // 2) Invoice paid (covers renewals + some flows where checkout event isn't used)
    if (
      event.type === "invoice_payment.paid" ||
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_succeeded"
    ) {
      const invoice = event.data.object as Stripe.Invoice;

      // Stripe types differ across versions; safely read from raw payload
      const subscriptionId =
        typeof (invoice as any).subscription === "string"
          ? (invoice as any).subscription
          : null;

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const businessId = (sub.metadata?.business_id as string | undefined) || undefined;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;

        if (businessId) {
          await supabase
            .from("businesses")
            .update({
              is_paid: true,
              stripe_customer_id: customerId,
              stripe_subscription_id: sub.id,
            })
            .eq("id", businessId);
        }
      }
    }

    // 3) Subscription canceled => mark unpaid
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;

      await supabase
        .from("businesses")
        .update({
          is_paid: false,
          paid_until: null,
        })
        .eq("stripe_subscription_id", sub.id);
    }
  } catch (e: any) {
    // IMPORTANT: return 200 so Stripe doesn't keep retrying while you're iterating
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e), event_type: event.type },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true });
}