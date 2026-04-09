import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderMonitoringStartedEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

function toCsvExportUrl(sheetUrl: string) {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match?.[1]) return null;

  const sheetId = match[1];

  let gid: string | null = null;
  try {
    const parsed = new URL(sheetUrl);
    gid = parsed.searchParams.get("gid");
  } catch {
    gid = null;
  }

  return gid
    ? `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
    : `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { business_id, sheet_url } = await req.json();

    if (!business_id || !sheet_url) {
      return NextResponse.json(
        { ok: false, error: "Missing business_id or sheet_url" },
        { status: 400 }
      );
    }

    const csvUrl = toCsvExportUrl(sheet_url);
    if (!csvUrl) {
      return NextResponse.json(
        { ok: false, error: "Invalid Google Sheet URL" },
        { status: 400 }
      );
    }

    const { data: source, error: sourceErr } = await supabase
      .from("sources")
      .select("id")
      .eq("business_id", business_id)
      .eq("type", "google_sheets_revenue")
      .maybeSingle();

    if (sourceErr) {
      return NextResponse.json(
        { ok: false, error: sourceErr.message },
        { status: 500 }
      );
    }

    let sourceId = source?.id ?? null;

    if (!sourceId) {
      const { data: created, error: createErr } = await supabase
        .from("sources")
        .insert({
          business_id,
          type: "google_sheets_revenue",
          display_name: "Google Sheets (Revenue)",
          is_connected: true,
          config: {
            sheet_url,
            csv_url: csvUrl,
            created_via: "google_sheets_connect",
          },
          meta: {
            created_at: new Date().toISOString(),
          },
        })
        .select("id")
        .single();

      if (createErr || !created?.id) {
        return NextResponse.json(
          { ok: false, error: createErr?.message ?? "Failed to create source" },
          { status: 500 }
        );
      }

      sourceId = created.id;
    } else {
      const { error: updateErr } = await supabase
        .from("sources")
        .update({
          is_connected: true,
          display_name: "Google Sheets (Revenue)",
          config: {
            sheet_url,
            csv_url: csvUrl,
            updated_at: new Date().toISOString(),
          },
        })
        .eq("id", sourceId);

      if (updateErr) {
        return NextResponse.json(
          { ok: false, error: updateErr.message },
          { status: 500 }
        );
      }
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("name,alert_email")
      .eq("id", business_id)
      .maybeSingle();

    if (business?.alert_email) {
      const { subject, text } = renderMonitoringStartedEmail({
        businessName: business.name,
        source: "Google Sheets",
      });

      await sendDriftEmail({
        to: business.alert_email,
        subject,
        text,
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://drifthq.co";

    const syncRes = await fetch(`${appUrl}/api/jobs/sheets-sync`, {
      method: "GET",
      cache: "no-store",
    });

    const syncJson = await syncRes.json().catch(() => null);

    if (!syncRes.ok) {
      console.error(
        `sheets-sync failed after connect for business ${business_id}:`,
        syncJson ?? "unknown sync error"
      );
    }

    const touchedBusinessIds: string[] = Array.isArray(syncJson?.touched_business_ids)
      ? syncJson.touched_business_ids
      : [];

    console.log("DRIFT SHEETS CONNECT: touched businesses after sync", {
      business_id,
      touchedBusinessIds,
    });

    for (const touchedBusinessId of touchedBusinessIds) {
      const computeRes = await fetch(`${appUrl}/api/internal/compute-first`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business_id: touchedBusinessId,
          force_email: true,
        }),
      });

      const computeText = await computeRes.text();

      console.log("DRIFT SHEETS CONNECT: compute result", {
        business_id: touchedBusinessId,
        ok: computeRes.ok,
        response: computeText,
      });

      if (!computeRes.ok) {
        console.error(
          `compute-first failed after sheets connect for business ${touchedBusinessId}:`,
          computeText
        );
      }
    }

    return NextResponse.json({
      ok: true,
      source_id: sourceId,
      csv_url: csvUrl,
      touched_business_ids: touchedBusinessIds,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}