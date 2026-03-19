import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Lazy init so Vercel build/collection doesn't crash if env vars
 * aren't present at build time.
 */
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key);
}

export async function POST(req: Request) {
  try {
    const stripe = getStripe();
    const supabase = supabaseAdmin();
    const body = await req.json().catch(() => null);

    const businessId = body?.business_id as string | undefined;
    if (!businessId) {
      return NextResponse.json(
        { ok: false, error: "business_id required" },
        { status: 400 }
      );
    }

    const { data: biz, error } = await supabase
      .from("businesses")
      .select(
        "id,name,alert_email,stripe_customer_id,billing_status,founding_cohort"
      )
      .eq("id", businessId)
      .single();

    if (error || !biz) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Business not found" },
        { status: 500 }
      );
    }

    if (biz.billing_status === "internal") {
      return NextResponse.json(
        {
          ok: false,
          error: "Internal businesses cannot create checkout sessions.",
        },
        { status: 403 }
      );
    }

    if (biz.billing_status === "active") {
      return NextResponse.json(
        { ok: false, error: "Business already has active billing." },
        { status: 409 }
      );
    }

    const plan = String(body?.plan || "standard");

    const priceMap: Record<string, string | undefined> = {
      standard: process.env.STRIPE_PRICE_STANDARD,
      founder_299: process.env.STRIPE_PRICE_FOUNDER_299,
      founder_399: process.env.STRIPE_PRICE_FOUNDER_399,
    };

    if (
      (plan === "founder_299" || plan === "founder_399") &&
      !biz.founding_cohort
    ) {
      return NextResponse.json(
        { ok: false, error: "Founder pricing not available." },
        { status: 403 }
      );
    }

    const priceId = priceMap[plan];

    if (!priceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid or missing Stripe price for selected plan.",
        },
        { status: 400 }
      );
    }

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    ).replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: biz.id,

      customer: biz.stripe_customer_id || undefined,
      customer_email: biz.stripe_customer_id
        ? undefined
        : biz.alert_email ?? undefined,

      line_items: [{ price: priceId, quantity: 1 }],

      metadata: { business_id: biz.id },
      subscription_data: {
        metadata: { business_id: biz.id },
      },

      success_url: `${appUrl}/onboard/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/onboard/cancel`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}