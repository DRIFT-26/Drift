import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  buildQuickBooksAuthorizeUrl,
  getQuickBooksEnv,
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

    if (!businessId) {
      return NextResponse.json(
        { ok: false, error: "Missing business_id" },
        { status: 400 }
      );
    }

    const { clientId, redirectUri, environment } = getQuickBooksEnv();

    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "QUICKBOOKS_CLIENT_ID missing (env)." },
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

    return NextResponse.redirect(connectUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
