import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { renderMonitoringStartedEmail } from "@/lib/email/templates";
import { sendDriftEmail } from "@/lib/email/resend";
import {
  exchangeQuickBooksCode,
  getQuickBooksEnv,
  mergeTokenConfig,
  QUICKBOOKS_SOURCE_TYPE,
} from "@/lib/quickbooks/client";

export const runtime = "nodejs";

function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status }
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = String(url.searchParams.get("code") || "").trim();
    const state = String(url.searchParams.get("state") || "").trim();
    const realmId = String(url.searchParams.get("realmId") || "").trim();
    const quickBooksError = url.searchParams.get("error");

    if (quickBooksError) {
      return jsonError(`QuickBooks OAuth error: ${quickBooksError}`, 400);
    }

    if (!code || !state || !realmId) {
      return jsonError("Missing required QuickBooks OAuth params.", 400, {
        has_code: Boolean(code),
        has_state: Boolean(state),
        has_realm_id: Boolean(realmId),
      });
    }

    const { clientId, clientSecret, redirectUri, appUrl } = getQuickBooksEnv();

    if (!clientId || !clientSecret) {
      return jsonError("QuickBooks client credentials missing (env).", 500);
    }

    const supabase = supabaseAdmin();

    const { data: source, error: sourceErr } = await supabase
      .from("sources")
      .select("id,business_id,type,config,is_connected")
      .eq("type", QUICKBOOKS_SOURCE_TYPE)
      .contains("config", { oauth_state: state })
      .maybeSingle();

    if (sourceErr) {
      return jsonError(
        `Supabase error finding source by state: ${sourceErr.message}`,
        500
      );
    }

    if (!source?.id) {
      return jsonError(
        "No pending QuickBooks source found for this state.",
        400
      );
    }

    const tokenJson = await exchangeQuickBooksCode({
      clientId,
      clientSecret,
      redirectUri,
      code,
    });

    const nextConfig = {
      ...mergeTokenConfig(source.config || {}, tokenJson),
      oauth_state: state,
      realm_id: realmId,
      connected_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from("sources")
      .update({
        is_connected: true,
        display_name: "QuickBooks (Revenue)",
        config: nextConfig,
        meta: {
          connected_via: "quickbooks_callback",
          updated_at: new Date().toISOString(),
        },
      })
      .eq("id", source.id);

    if (updateErr) {
      return jsonError(
        `Failed to mark QuickBooks source connected: ${updateErr.message}`,
        500
      );
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("name,alert_email")
      .eq("id", source.business_id)
      .maybeSingle();

    if (business?.alert_email) {
      const { subject, text } = renderMonitoringStartedEmail({
        businessName: business.name,
        source: "QuickBooks",
      });

      await sendDriftEmail({
        to: business.alert_email,
        subject,
        text,
      });
    }

    const cronSecret = (process.env.CRON_SECRET || "").trim();

    const ingestRes = await fetch(
      `${appUrl}/api/jobs/quickbooks-ingest?days=74&business_id=${encodeURIComponent(
        source.business_id
      )}`,
      {
        method: "POST",
        cache: "no-store",
        headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
      }
    ).catch((error) => {
      console.error("QuickBooks initial ingest trigger failed:", error);
      return null;
    });

    if (ingestRes?.ok) {
      await fetch(`${appUrl}/api/internal/compute-first`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business_id: source.business_id,
          force_email: true,
        }),
      }).catch((error) => {
        console.error("QuickBooks initial compute trigger failed:", error);
      });
    } else if (ingestRes) {
      const ingestText = await ingestRes.text().catch(() => "");
      console.error("QuickBooks initial ingest returned non-ok response:", {
        status: ingestRes.status,
        response: ingestText.slice(0, 500),
      });
    }

    const redirectTo = new URL(
      `/onboard/success?business_id=${encodeURIComponent(
        source.business_id
      )}&signal=processing&source=quickbooks`,
      appUrl
    ).toString();

    return NextResponse.redirect(redirectTo);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return jsonError(message, 500);
  }
}
