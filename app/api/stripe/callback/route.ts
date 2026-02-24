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

  // 1) Find the stripe_revenue source by oauth_state
  const { data: source, error: sErr } = await supabase
    .from("sources")
    .select("id,business_id,type,config,is_connected")
    .eq("type", "stripe_revenue")
    .contains("config", { oauth_state: state })
    .maybeSingle();

  if (sErr) return jsonError(`Supabase error finding source by state: ${sErr.message}`, 500);
  if (!source?.id) {
    return jsonError("No pending Stripe source found for this state. (State mismatch or never created.)", 400);
  }

  // 2) Exchange code -> tokens
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
    tokenJson = null;
  }

  if (!tokenRes.ok) {
    return jsonError("Stripe token exchange failed.", 400, {
      status: tokenRes.status,
      stripe: tokenJson ?? tokenText.slice(0, 300),
    });
  }

  const stripeUserId = tokenJson?.stripe_user_id;
  const accessToken = tokenJson?.access_token;
  const refreshToken = tokenJson?.refresh_token ?? null;
  const scope = tokenJson?.scope ?? null;
  const livemode = Boolean(tokenJson?.livemode);

  if (!stripeUserId || !accessToken) {
    return jsonError("Stripe token response missing required fields.", 400, { stripe: tokenJson });
  }

  // 3) Update stripe_revenue source -> connected
  const nextConfig = {
    ...(source.config || {}),
    oauth_state: state,
    stripe_user_id: stripeUserId,
    access_token: accessToken,
    refresh_token: refreshToken,
    scope,
    livemode,
    connected_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("sources")
    .update({
      is_connected: true,
      config: nextConfig,
      meta: { connected_via: "stripe_callback", updated_at: new Date().toISOString() },
    })
    .eq("id", source.id);

  if (upErr) return jsonError(`Failed to mark Stripe source connected: ${upErr.message}`, 500);

  // 4) Ensure a stripe_refunds source exists (so refunds ingest can run if you support it)
  // (If you don't ingest refunds separately yet, keeping this in place is still fine for v1.)
  const { data: refundsExisting, error: rReadErr } = await supabase
    .from("sources")
    .select("id")
    .eq("business_id", source.business_id)
    .eq("type", "stripe_refunds")
    .maybeSingle();

  if (!rReadErr && !refundsExisting?.id) {
    await supabase.from("sources").insert({
      business_id: source.business_id,
      type: "stripe_refunds",
      display_name: "Stripe (Refunds)",
      is_connected: true,
      config: {
        stripe_user_id: stripeUserId,
        // reuse access token so ingest can pull refunds if your job supports it
        access_token: accessToken,
        refresh_token: refreshToken,
        scope,
        livemode,
        connected_at: new Date().toISOString(),
        created_via: "stripe_callback",
      },
      meta: { created_at: new Date().toISOString() },
    });
  }

  // 5) Redirect back to alerts (quiet + executive-safe)
  const redirectTo = new URL(`/alerts/${source.business_id}`, req.url).toString();
  return NextResponse.redirect(redirectTo);
}