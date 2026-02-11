import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing session_id" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const businessId = session.metadata?.business_id;
  if (!businessId) {
    return NextResponse.json({ ok: false, error: "No business_id on session" }, { status: 404 });
  }

  // Optional: sanity check business exists
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .single();

  if (!data) {
    return NextResponse.json({ ok: false, error: "Business not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, businessId });
}