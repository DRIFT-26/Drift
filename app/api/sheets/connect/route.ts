import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function toCsvExportUrl(sheetUrl: string) {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match?.[1]) return null;

  const sheetId = match[1];
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
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

    return NextResponse.json({
      ok: true,
      source_id: sourceId,
      csv_url: csvUrl,
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