// app/api/stripe/callback/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
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

  // 1) Find the source row by oauth_state (best / safest)
  const { data: sourceByState, error: s1Err } = await supabase
    .from("sources")
    .select("id,business_id,type,config,is_connected")
    .eq("type", "stripe_revenue")
    .contains("config", { oauth_state: state })
    .maybeSingle();

  // If we can't find it by state, we still might be able to find it by business_id later
  // BUT we don't have business_id in the callback query params, so state must be enough.
  const source = sourceByState;

  if (s1Err) {
    return jsonError(`Supabase error finding source by state: ${s1Err.message}`, 500);
  }

  if (!source?.id) {
    return jsonError(
      "No pending Stripe source found for this state. (State mismatch or source never created.)",
      400
    );
  }

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
    // leave as null
  }

  if (!tokenRes.ok) {
    return jsonError("Stripe token exchange failed.", 400, {
      status: tokenRes.status,
      stripe: tokenJson ?? tokenText.slice(0, 300),
    });
  }

  // Expected fields:
  // access_token, refresh_token, stripe_user_id, scope, livemode, token_type
  const stripeUserId = tokenJson?.stripe_user_id;
  const accessToken = tokenJson?.access_token;
  const refreshToken = tokenJson?.refresh_token;
  const scope = tokenJson?.scope;
  const livemode = tokenJson?.livemode;

  if (!stripeUserId || !accessToken) {
    return jsonError("Stripe token response missing required fields.", 400, { stripe: tokenJson });
  }

  // 3) Update the source as connected
  const nextConfig = {
    ...(source.config || {}),
    oauth_state: state,
    stripe_user_id: stripeUserId,
    access_token: accessToken,
    refresh_token: refreshToken ?? null,
    scope: scope ?? null,
    livemode: Boolean(livemode),
    connected_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("sources")
    .update({
      is_connected: true,
      config: nextConfig,
      meta: {
        connected_via: "stripe_callback",
        updated_at: new Date().toISOString(),
      },
    })
    .eq("id", source.id);

  if (upErr) {
    return jsonError(`Failed to mark Stripe source connected: ${upErr.message}`, 500);
  }

  // 4) Redirect back to the business alerts page (quiet, executive-safe)
  // If you prefer JSON instead of redirect, swap to NextResponse.json(...)
  const redirectTo = new URL(`/alerts/${source.business_id}`, req.url).toString();
  return NextResponse.redirect(redirectTo);
}