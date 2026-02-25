// app/api/onboard/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STRIPE_CLIENT_ID = process.env.STRIPE_CLIENT_ID || "";

/**
 * Stripe Connect Standard OAuth URL builder (no external helper import).
 * Docs: https://stripe.com/docs/connect/oauth-reference
 */
function stripeAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  businessName?: string | null;
  email?: string | null;
}) {
  const { clientId, redirectUri, state, businessName, email } = args;

  const u = new URL("https://connect.stripe.com/oauth/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("scope", "read_write");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);

  // Optional prefill fields (Stripe ignores what it doesn't use)
  if (businessName) u.searchParams.set("stripe_user[business_name]", businessName);
  if (email) u.searchParams.set("stripe_user[email]", email);

  return u.toString();
}

function randomState(len = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toIntOrNull(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim().length) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();

    if (!STRIPE_CLIENT_ID) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_CLIENT_ID env var" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const businessName =
      typeof body?.business_name === "string" && body.business_name.trim().length
        ? body.business_name.trim()
        : null;

    const email =
  typeof body?.email === "string" && body.email.trim().length
    ? body.email.trim().toLowerCase()
    : null;

    const timezone =
      typeof body?.timezone === "string" && body.timezone.trim().length
        ? body.timezone.trim()
        : "America/Chicago";

    // Accept either cents or dollars for monthly revenue
    const monthlyRevenueCentsDirect = toIntOrNull(body?.monthly_revenue_cents);
    const monthlyRevenueDollars = toIntOrNull(body?.monthly_revenue);

    const monthlyRevenueCents =
      monthlyRevenueCentsDirect !== null
        ? monthlyRevenueCentsDirect
        : monthlyRevenueDollars !== null
        ? Math.round(monthlyRevenueDollars * 100)
        : null;

    if (!businessName) {
      return NextResponse.json({ ok: false, error: "Missing business_name" }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
    }

    // 1) Create business
    const { data: business, error: bErr } = await supabase
      .from("businesses")
      .insert({
        owner_id: "00000000-0000-0000-0000-000000000000", // TODO: replace when auth is live
        name: businessName,
        timezone,
        alert_email: email,
        ...(monthlyRevenueCents !== null ? { monthly_revenue_cents: monthlyRevenueCents } : {}),
      })
      .select("id,name,timezone,alert_email,monthly_revenue_cents")
      .single();

    if (bErr || !business?.id) {
      return NextResponse.json(
        { ok: false, error: `Create business failed: ${bErr?.message || "unknown"}` },
        { status: 500 }
      );
    }

    // 2) Ensure default sources exist (Stripe + optional CSV placeholders)
    const state = randomState();

    // NOTE: these types MUST exist in your `source_type` enum.
    // Your enum includes: csv_reviews, csv_engagement, google_reviews, klaviyo, stripe_revenue, stripe_refunds
    const defaultSources = [
      {
        business_id: business.id,
        type: "stripe_revenue",
        display_name: "Stripe (Revenue)",
        is_connected: false,
        config: { oauth_state: state, created_via: "onboard" },
        meta: {},
      },
      {
        business_id: business.id,
        type: "stripe_refunds",
        display_name: "Stripe (Refunds)",
        is_connected: false,
        config: { oauth_state: state, created_via: "onboard" },
        meta: {},
      },
      // Optional placeholders for beta (manual CSV paths)
      {
        business_id: business.id,
        type: "csv_reviews",
        display_name: "CSV (Reviews)",
        is_connected: false,
        config: { mode: "manual" },
        meta: {},
      },
      {
        business_id: business.id,
        type: "csv_engagement",
        display_name: "CSV (Engagement)",
        is_connected: false,
        config: { mode: "manual" },
        meta: {},
      },
    ];

    const { error: upsertErr } = await supabase
      .from("sources")
      .upsert(defaultSources as any, { onConflict: "business_id,type" });

    if (upsertErr) {
      return NextResponse.json(
        { ok: false, error: `Create default sources failed: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    // 3) Fetch Stripe revenue source id (fixes “Cannot find name 'source'”)
    const { data: stripeSource, error: stripeFetchErr } = await supabase
      .from("sources")
      .select("id")
      .eq("business_id", business.id)
      .eq("type", "stripe_revenue")
      .single();

    if (stripeFetchErr || !stripeSource?.id) {
      return NextResponse.json(
        { ok: false, error: `Fetch Stripe source failed: ${stripeFetchErr?.message || "unknown"}` },
        { status: 500 }
      );
    }

    // 4) Generate Stripe Connect URL
    const redirectUri = new URL("/api/stripe/callback", req.url).toString();

    const connectUrl = stripeAuthorizeUrl({
      clientId: STRIPE_CLIENT_ID,
      redirectUri,
      state,
      businessName,
      email,
    });

    return NextResponse.json({
      ok: true,
      business_id: business.id,
      source_id: stripeSource.id,
      connect_url: connectUrl,
      next: {
        connect: connectUrl,
        alerts: `/alerts/${business.id}`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}