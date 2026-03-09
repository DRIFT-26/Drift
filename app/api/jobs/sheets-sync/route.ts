import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = supabaseAdmin();

  const { data: sources } = await supabase
    .from("sources")
    .select("*")
    .eq("type", "google_sheets_revenue");

  for (const source of sources ?? []) {
    const url = source.config?.sheet_url;

    if (!url) continue;

    const csvRes = await fetch(url);
    const text = await csvRes.text();

    const rows = text.split("\n").slice(1);

    const snapshots = rows
      .map((row) => {
        const [date, revenue] = row.split(",");

        if (!date || !revenue) return null;

        return {
          business_id: source.business_id,
          source_id: source.id,
          snapshot_date: date.trim(),
          metrics: {
            revenue: Number(revenue),
          },
        };
      })
      .filter(Boolean);

    if (!snapshots.length) continue;

    await supabase
  .from("snapshots")
  .upsert(snapshots, {
    onConflict: "source_id,snapshot_date",
  });

// trigger drift computation after ingest
await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/internal/compute-first`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    business_id: source.business_id,
  }),
});
}

  return NextResponse.json({ ok: true });
}