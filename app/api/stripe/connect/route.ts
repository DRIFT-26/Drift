// app/api/stripe/connect/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import crypto from "crypto";

export const runtime = "nodejs";

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
  u.searchParams.set("scope", "read_only");
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("state", args.state);
  u.searchParams.set("stripe_user[business_name]", args.businessName);
  u.searchParams.set("stripe_user[email]", args.email);
  return u.toString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = String(url.searchParams.get("business_id") || "").trim();

  if (!businessId) {
    return NextResponse.json({ ok: false, error: "Missing business_id" }, { status: 400 });
  }

  const STRIPE_CLIENT_ID = (process.env.STRIPE_CLIENT_ID || "").trim();
  if (!STRIPE_CLIENT_ID) {
    return NextResponse.json({ ok: false, error: "STRIPE_CLIENT_ID missing (env)." }, { status: 500 });
  }

  const supabase = supabaseAdmin();

  const { data: biz, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,alert_email")
    .eq("id", businessId)
    .single();

  if (bErr || !biz?.id) {
    return NextResponse.json({ ok: false, error: `Business not found: ${bErr?.message || "unknown"}` }, { status: 404 });
  }

  // Find stripe source (or create it if missing)
  const { data: existing } = await supabase
    .from("sources")
    .select("id,config,is_connected")
    .eq("business_id", businessId)
    .eq("type", "stripe_revenue")
    .maybeSingle();

  const state = randomState();

  let sourceId = existing?.id;

  if (!existing?.id) {
    const { data: created, error: sErr } = await supabase
      .from("sources")
      .insert({
        business_id: businessId,
        type: "stripe_revenue",
        display_name: "Stripe (Revenue)",
        is_connected: false,
        config: { oauth_state: state, created_via: "connect_route" },
      })
      .select("id")
      .single();

    if (sErr || !created?.id) {
      return NextResponse.json({ ok: false, error: `Create Stripe source failed: ${sErr?.message || "unknown"}` }, { status: 500 });
    }

    sourceId = created.id;
  } else {
    // Refresh state on the existing source (even if previously attempted)
    await supabase
      .from("sources")
      .update({ config: { ...(existing.config || {}), oauth_state: state } })
      .eq("id", sourceId);
  }

  const redirectUri = new URL("/api/stripe/callback", req.url).toString();
  const connectUrl = stripeAuthorizeUrl({
    clientId: STRIPE_CLIENT_ID,
    redirectUri,
    state,
    businessName: biz.name,
    email: biz.alert_email,
  });

  return NextResponse.json({
    ok: true,
    business_id: businessId,
    source_id: sourceId,
    connect_url: connectUrl,
  });
}