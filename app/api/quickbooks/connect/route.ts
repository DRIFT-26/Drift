import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  buildQuickBooksAuthorizeUrl,
  getQuickBooksClientIdIssue,
  getQuickBooksEnv,
  maskedValue,
  QUICKBOOKS_SOURCE_TYPE,
} from "@/lib/quickbooks/client";
import crypto from "crypto";

export const runtime = "nodejs";

function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const businessId = String(url.searchParams.get("business_id") || "").trim();
    const preview = url.searchParams.get("preview") === "1";

    if (!businessId) {
      return NextResponse.json(
        { ok: false, error: "Missing business_id" },
        { status: 400 }
      );
    }

    const {
      clientId,
      redirectUri,
      environment,
      appUrlIssue,
      redirectUriIssue,
    } = getQuickBooksEnv();

    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "QUICKBOOKS_CLIENT_ID missing (env)." },
        { status: 500 }
      );
    }

    const clientIdIssue = getQuickBooksClientIdIssue(clientId);
    if (clientIdIssue) {
      return NextResponse.json(
        {
          ok: false,
          error: `QUICKBOOKS_CLIENT_ID is invalid: ${clientIdIssue}.`,
        },
        { status: 500 }
      );
    }

    if (appUrlIssue || redirectUriIssue) {
      return NextResponse.json(
        {
          ok: false,
          error: "QuickBooks URL environment variables are invalid.",
          appUrlIssue,
          redirectUriIssue,
        },
        { status: 500 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: biz, error: bErr } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .single();

    if (bErr || !biz?.id) {
      return NextResponse.json(
        { ok: false, error: `Business not found: ${bErr?.message || "unknown"}` },
        { status: 404 }
      );
    }

    const { data: existing, error: sourceReadErr } = await supabase
      .from("sources")
      .select("id,config")
      .eq("business_id", businessId)
      .eq("type", QUICKBOOKS_SOURCE_TYPE)
      .maybeSingle();

    if (sourceReadErr) {
      return NextResponse.json(
        { ok: false, error: `Read sources failed: ${sourceReadErr.message}` },
        { status: 500 }
      );
    }

    const state = randomState();
    let sourceId = existing?.id ?? null;

    if (!sourceId) {
      const { data: created, error: createErr } = await supabase
        .from("sources")
        .insert({
          business_id: businessId,
          type: QUICKBOOKS_SOURCE_TYPE,
          display_name: "QuickBooks (Revenue)",
          is_connected: false,
          config: {
            oauth_state: state,
            quickbooks_environment: environment,
            created_via: "quickbooks_connect",
          },
          meta: {
            created_at: new Date().toISOString(),
          },
        })
        .select("id")
        .single();

      if (createErr || !created?.id) {
        return NextResponse.json(
          {
            ok: false,
            error: `Create QuickBooks source failed: ${
              createErr?.message || "unknown"
            }`,
          },
          { status: 500 }
        );
      }

      sourceId = created.id;
    } else {
      const nextConfig = {
        ...(existing?.config || {}),
        oauth_state: state,
        quickbooks_environment: environment,
        updated_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabase
        .from("sources")
        .update({ config: nextConfig })
        .eq("id", sourceId);

      if (updateErr) {
        return NextResponse.json(
          { ok: false, error: `Update oauth_state failed: ${updateErr.message}` },
          { status: 500 }
        );
      }
    }

    const connectUrl = buildQuickBooksAuthorizeUrl({
      clientId,
      redirectUri,
      state,
    });

    if (preview) {
      const authorizationUrl = new URL(connectUrl);

      return NextResponse.json({
        ok: true,
        preview: true,
        quickbooks: {
          authorizationOrigin: authorizationUrl.origin,
          authorizationPath: authorizationUrl.pathname,
          hasClientIdParam: authorizationUrl.searchParams.has("client_id"),
          clientIdPreview: maskedValue(
            authorizationUrl.searchParams.get("client_id") || ""
          ),
          responseType: authorizationUrl.searchParams.get("response_type"),
          scope: authorizationUrl.searchParams.get("scope"),
          redirectUri: authorizationUrl.searchParams.get("redirect_uri"),
          hasState: Boolean(authorizationUrl.searchParams.get("state")),
          environment,
        },
        note:
          "Preview mode validates the Intuit authorization request without exposing the full Client ID, secret, tokens, or customer data.",
      });
    }

    return NextResponse.redirect(connectUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
