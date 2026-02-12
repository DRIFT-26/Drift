import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs"; // Node runtime for Stripe signature verification

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function markBusinessPaid(params: {
  supabase: ReturnType<typeof supabaseAdmin>;
  businessId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  const { supabase, businessId, customerId, subscriptionId } = params;
  if (!businessId) return;

  await supabase
    .from("businesses")
    .update({
      is_paid: true,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: subscriptionId ?? null,
    })
    .eq("id", businessId);
}

export async function POST(req: Request) {
  // Basic env checks
  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const supabase = supabaseAdmin();

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  try {
    // 1) Preferred: Checkout completion (has metadata and subscription/customer ids)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const businessId = session.metadata?.business_id ?? null;
      const customerId = typeof session.customer === "string" ? session.customer : null;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;

      await markBusinessPaid({
        supabase,
        businessId,
        customerId,
        subscriptionId,
      });
    }

    // 2) Invoice paid (Stripe may emit invoice.paid more reliably than invoice_payment.paid)
    if (
  event.type === "invoice_payment.paid" ||
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

// Stripe types vary by version; safely read from the raw payload
const subscriptionId =
  typeof (invoice as any).subscription === "string"
    ? (invoice as any).subscription
    : null;

      // If we have subscription, retrieve it so we can read metadata.business_id
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        const businessId = (sub.metadata?.business_id as string | undefined) ?? null;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;

        await markBusinessPaid({
          supabase,
          businessId,
          customerId,
          subscriptionId: sub.id,
        });
      }
    }

    // 3) Subscription canceled -> mark unpaid
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const subscriptionId = sub.id;

      await supabase
        .from("businesses")
        .update({
          is_paid: false,
          paid_until: null,
        })
        .eq("stripe_subscription_id", subscriptionId);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // In dev, return 200 to prevent Stripe retries, but include error for debugging
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e), event_type: event.type },
      { status: 200 }
    );
  }
}