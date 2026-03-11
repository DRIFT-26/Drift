import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = supabaseAdmin();

    const { data: sources, error: sourceErr } = await supabase
      .from("sources")
      .select("*")
      .eq("type", "google_sheets_revenue")
      .eq("is_connected", true);

    if (sourceErr) {
      return NextResponse.json(
        { ok: false, error: sourceErr.message },
        { status: 500 }
      );
    }

    for (const source of sources ?? []) {
      const csvUrl = source.config?.csv_url as string | undefined;
      if (!csvUrl) continue;

      const csvRes = await fetch(csvUrl, { cache: "no-store" });
      if (!csvRes.ok) continue;

      const text = await csvRes.text();
      const rows = text
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean);

      if (rows.length < 2) continue;

      const dataRows = rows.slice(1);

      const snapshots = dataRows
        .map((row) => {
          const [dateRaw, revenueRaw] = row.split(",");
          const snapshotDate = dateRaw?.trim();
          const revenue = Number(revenueRaw?.trim());

          if (!snapshotDate || Number.isNaN(revenue)) return null;

          return {
            business_id: source.business_id,
            source_id: source.id,
            snapshot_date: snapshotDate,
            metrics: {
              revenue,
            },
          };
        })
        .filter(Boolean);

      if (!snapshots.length) continue;

      await supabase.from("snapshots").upsert(snapshots, {
        onConflict: "source_id,snapshot_date",
      });

      await supabase
  .from("businesses")
  .update({
    needs_compute: true,
    last_ingested_at: new Date().toISOString(),
  })
  .eq("id", source.business_id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}