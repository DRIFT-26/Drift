// app/api/onboard/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import crypto from "crypto";

export const runtime = "nodejs";

type OnboardBody = {
  business_name: string;
  email: string;
  monthly_revenue_cents?: number | null;
  timezone?: string;
};

function normalizeMoneyCents(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

function stripeAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  businessName: string;
  email: string;
}) {
  const u = new URL("https://connect.stripe.com/oauth/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", args.clientId);
  u.searchParams.set("scope", "read_only"); // v1: read-only signals
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("state", args.state);

  // Prefill (nice touch, optional)
  u.searchParams.set("stripe_user[business_name]", args.businessName);
  u.searchParams.set("stripe_user[email]", args.email);

  return u.toString();
}

async function bestEffortInternalPost(req: Request, pathWithQuery: string) {
  try {
    const url = new URL(pathWithQuery, req.url);
    await fetch(url, { method: "POST" });
  } catch {
    // ignore
  }
}

export async function POST(req: Request) {
  const supabase = supabaseAdmin();

  let payload: OnboardBody;
  try {
    payload = (await req.json()) as OnboardBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON body." }, { status: 400 });
  }

  const businessName = String(payload.business_name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const timezone = String(payload.timezone || "America/Chicago").trim() || "America/Chicago";
  const monthlyRevenueCents = normalizeMoneyCents(payload.monthly_revenue_cents);

  if (!businessName || !email) {
    return NextResponse.json({ ok: false, error: "Missing business_name or email." }, { status: 400 });
  }

  const STRIPE_CLIENT_ID = (process.env.STRIPE_CLIENT_ID || "").trim();
  if (!STRIPE_CLIENT_ID) {
    return NextResponse.json({ ok: false, error: "STRIPE_CLIENT_ID missing (env)." }, { status: 500 });
  }

  // 1) Create business
  const { data: business, error: bErr } = await supabase
    .from("businesses")
    .insert({
      owner_id: "00000000-0000-0000-0000-000000000000", // TODO when auth is live
      name: businessName,
      timezone,
      alert_email: email,
      ...(monthlyRevenueCents !== null ? { monthly_revenue_cents: monthlyRevenueCents } : {}),
    })
    .select("id,name,timezone,alert_email")
    .single();

  if (bErr || !business?.id) {
    return NextResponse.json(
      { ok: false, error: `Create business failed: ${bErr?.message || "unknown"}` },
      { status: 500 }
    );
  }

  // 2) Create Stripe source (pending connect)
  const state = randomState();

  const { data: source, error: sErr } = await supabase
    .from("sources")
    .insert({
      business_id: business.id,
      type: "stripe_revenue",
      display_name: "Stripe (Revenue)",
      is_connected: false,
      config: {
        oauth_state: state,
        created_via: "onboard",
      },
    })
    .select("id")
    .single();

  if (sErr || !source?.id) {
    return NextResponse.json(
      { ok: false, error: `Create Stripe source failed: ${sErr?.message || "unknown"}` },
      { status: 500 }
    );
  }

  // 3) Generate Stripe Connect URL
  const redirectUri = new URL("/api/stripe/callback", req.url).toString();
  const connectUrl = stripeAuthorizeUrl({
    clientId: STRIPE_CLIENT_ID,
    redirectUri,
    state,
    businessName,
    email,
  });

  // 4) Welcome email (non-blocking) — tells them to connect Stripe
  try {
    await sendDriftEmail({
      to: email,
      subject: "Finish setup: connect Stripe",
      text:
        `You're almost live.\n\n` +
        `Next step: connect Stripe so DRIFT can monitor Revenue Momentum.\n\n` +
        `After connecting, you'll see:\n` +
        `• Revenue Velocity (14d vs 60d)\n` +
        `• Momentum Direction\n` +
        `• Refund trend risk\n\n— DRIFT`,
    });
  } catch {
    // ignore
  }

  return NextResponse.json({
    ok: true,
    business_id: business.id,
    source_id: source.id,
    connect_url: connectUrl,
    next: {
      connect: connectUrl,
      callback: "/api/stripe/callback",
      success: `/onboard/success?businessId=${business.id}`,
    },
  });
}