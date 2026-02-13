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
      return NextResponse.json({ ok: false, error: "business_id required" }, { status: 400 });
    }

    const { data: biz, error } = await supabase
      .from("businesses")
      .select("id,name,alert_email,stripe_customer_id")
      .eq("id", businessId)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_PRICE_ID" }, { status: 500 });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",

      customer: biz.stripe_customer_id || undefined,
      customer_email: biz.stripe_customer_id ? undefined : (biz.alert_email ?? undefined),

      line_items: [{ price: priceId, quantity: 1 }],

      // Attach business_id to BOTH the session and the subscription
      metadata: { business_id: biz.id },
      subscription_data: { metadata: { business_id: biz.id } },

      success_url: `${appUrl}/onboard/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/onboard/cancel`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}