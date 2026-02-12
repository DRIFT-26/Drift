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

export async function GET(req: Request) {
  try {
    const stripe = getStripe();

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "Missing session_id" }, { status: 400 });
    }

    // Retrieve the Checkout Session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Prefer metadata on session; fallback to pulling subscription metadata if needed
    let businessId: string | null = session.metadata?.business_id ?? null;

    if (!businessId) {
      const subId = typeof session.subscription === "string" ? session.subscription : null;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        businessId = (sub.metadata?.business_id as string | undefined) ?? null;
      }
    }

    if (!businessId) {
      return NextResponse.json({ ok: false, error: "No business_id found on session/subscription" }, { status: 404 });
    }

    // Sanity check: business exists
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Business not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, businessId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}