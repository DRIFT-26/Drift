// app/api/stripe/callback/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

type SourceType = "stripe_revenue" | "stripe_refunds";

function nowIso() {
  return new Date().toISOString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = String(url.searchParams.get("code") || "").trim();
  const state = String(url.searchParams.get("state") || "").trim();

  // Stripe sometimes includes these on error
  const stripeError = url.searchParams.get("error");
  const stripeErrorDesc = url.searchParams.get("error_description");

  if (stripeError) {
    return jsonError(
      `Stripe OAuth error: ${stripeError}${stripeErrorDesc ? ` (${stripeErrorDesc})` : ""}`,
      400
    );
  }

  if (!code || !state) {
    return jsonError("Missing required Stripe OAuth params (code/state).", 400, {
      has_code: Boolean(code),
      has_state: Boolean(state),
    });
  }

  const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!STRIPE_SECRET_KEY) return jsonError("STRIPE_SECRET_KEY missing (env).", 500);

  const supabase = supabaseAdmin();

  // 1) Find the pending Stripe source row by oauth_state (revenue OR refunds)
  const { data: pendingSource, error: sErr } = await supabase
    .from("sources")
    .select("id,business_id,type,config,is_connected")
    .in("type", ["stripe_revenue", "stripe_refunds"])
    .contains("config", { oauth_state: state })
    .maybeSingle();

  if (sErr) {
    return jsonError(`Supabase error finding source by state: ${sErr.message}`, 500);
  }

  if (!pendingSource?.id || !pendingSource?.business_id) {
    return jsonError(
      "No pending Stripe source found for this state. (State mismatch or source never created.)",
      400
    );
  }

  const businessId = pendingSource.business_id;

  // 2) Exchange code -> tokens at Stripe
  const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
    }),
  });

  const tokenText = await tokenRes.text();
  let tokenJson: any = null;
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    // ignore
  }

  if (!tokenRes.ok) {
    return jsonError("Stripe token exchange failed.", 400, {
      status: tokenRes.status,
      stripe: tokenJson ?? tokenText.slice(0, 300),
    });
  }

  // Expected fields:
  // access_token, refresh_token, stripe_user_id, scope, livemode, token_type
  const stripeAccountId = tokenJson?.stripe_user_id; // typically "acct_..."
  const accessToken = tokenJson?.access_token;
  const refreshToken = tokenJson?.refresh_token;
  const scope = tokenJson?.scope;
  const livemode = tokenJson?.livemode;

  if (!stripeAccountId || !accessToken) {
    return jsonError("Stripe token response missing required fields.", 400, {
      stripe: tokenJson,
    });
  }

  // 3) Upsert BOTH Stripe sources so ingest + compute never get stuck/skipped
  const connectedAt = nowIso();

  const baseConfig = {
    oauth_state: state, // keep for traceability; ok to keep
    stripe_account_id: stripeAccountId,
    access_token: accessToken,
    refresh_token: refreshToken ?? null,
    scope: scope ?? null,
    livemode: Boolean(livemode),
    connected_at: connectedAt,
  };

  const rows = [
    {
      business_id: businessId,
      type: "stripe_revenue" as SourceType,
      display_name: "Stripe (Revenue)",
      is_connected: true,
      config: baseConfig,
      meta: { connected_via: "stripe_callback", updated_at: connectedAt },
    },
    {
      business_id: businessId,
      type: "stripe_refunds" as SourceType,
      display_name: "Stripe (Refunds)",
      is_connected: true,
      config: baseConfig,
      meta: { connected_via: "stripe_callback", updated_at: connectedAt },
    },
  ];

  // IMPORTANT: this requires a unique constraint on (business_id, type)
  // If you don't have it yet, add it in Supabase (recommended).
  const { error: upsertErr } = await supabase
    .from("sources")
    .upsert(rows as any, { onConflict: "business_id,type" });

  if (upsertErr) {
    return jsonError(`Failed to upsert Stripe sources: ${upsertErr.message}`, 500);
  }

  // 4) Redirect back to business alerts (quiet, executive-safe)
  const redirectTo = new URL(`/alerts/${businessId}`, req.url).toString();
  return NextResponse.redirect(redirectTo);
}