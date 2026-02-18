// app/api/stripe/callback/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";

export const runtime = "nodejs";

async function stripeOAuthTokenExchange(args: { code: string; redirectUri: string }) {
  const secretKey = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY missing (env).");

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", args.code);
  body.set("redirect_uri", args.redirectUri);

  const res = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`stripe_oauth_failed: ${json?.error_description || json?.error || res.statusText}`);
  }
  return json as {
    stripe_user_id: string; // acct_...
    livemode: boolean;
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
  };
}

async function bestEffortInternalPost(req: Request, pathWithQuery: string) {
  try {
    const url = new URL(pathWithQuery, req.url);
    await fetch(url, { method: "POST" });
  } catch {
    // ignore
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = String(url.searchParams.get("code") || "");
  const state = String(url.searchParams.get("state") || "");
  const error = String(url.searchParams.get("error") || "");
  const errorDesc = String(url.searchParams.get("error_description") || "");

  if (error) {
    return NextResponse.redirect(new URL(`/onboard/success?error=${encodeURIComponent(errorDesc || error)}`, req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`/onboard/success?error=${encodeURIComponent("Missing code/state")}`, req.url));
  }

  const supabase = supabaseAdmin();

  // Find the Stripe source by oauth_state
  const { data: source, error: sErr } = await supabase
    .from("sources")
    .select("id,business_id,config")
    .eq("type", "stripe_revenue")
    .eq("config->>oauth_state", state)
    .maybeSingle();

  if (sErr || !source?.id) {
    return NextResponse.redirect(new URL(`/onboard/success?error=${encodeURIComponent("Invalid/expired Stripe state")}`, req.url));
  }

  const redirectUri = new URL("/api/stripe/callback", req.url).toString();

  // Exchange code for connected account id
  const token = await stripeOAuthTokenExchange({ code, redirectUri });

  const stripeAccountId = token.stripe_user_id;
  const livemode = Boolean(token.livemode);

  // Mark source connected
  const prevCfg = (source.config || {}) as any;
  const nextCfg = {
    ...prevCfg,
    stripe_account_id: stripeAccountId,
    livemode,
  };
  delete nextCfg.oauth_state;

  await supabase
    .from("sources")
    .update({
      is_connected: true,
      config: nextCfg,
    })
    .eq("id", source.id);

  // Load business for email + next steps
  const { data: biz } = await supabase
    .from("businesses")
    .select("id,name,alert_email")
    .eq("id", source.business_id)
    .maybeSingle();

  // Confirmation email (non-blocking)
  try {
    if (biz?.alert_email) {
      await sendDriftEmail({
        to: biz.alert_email,
        subject: "Stripe connected — DRIFT is live",
        text:
          `Connected.\n\n` +
          `DRIFT is now monitoring Revenue Momentum for ${biz?.name || "your business"}.\n\n` +
          `Next: you’ll start receiving momentum signals automatically.\n\n— DRIFT`,
      });
    }
  } catch {
    // ignore
  }

  // Kick off initial backfill + compute
  // NOTE: you'll create /api/jobs/stripe-ingest next (we’ll do that immediately after this).
  await bestEffortInternalPost(req, `/api/jobs/stripe-ingest?business_id=${source.business_id}&days=60`);
  await bestEffortInternalPost(req, `/api/jobs/daily?business_id=${source.business_id}&force_email=true`);

  return NextResponse.redirect(new URL(`/onboard/success?businessId=${source.business_id}`, req.url));
}