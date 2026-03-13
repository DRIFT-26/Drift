import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

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

      const header = rows[0].toLowerCase();
      const hasLocation = header === "location,date,revenue";
      const isSingleLocation = header === "date,revenue";

      if (!hasLocation && !isSingleLocation) {
        continue;
      }

      const dataRows = rows.slice(1);

      const { data: parentBusiness } = await supabase
        .from("businesses")
        .select("id,name,alert_email,timezone")
        .eq("id", source.business_id)
        .maybeSingle();

      if (!parentBusiness) continue;

      const grouped: Record<
        string,
        Array<{ snapshot_date: string; revenue: number }>
      > = {};

      for (const row of dataRows) {
        const parts = row.split(",");

        const location = hasLocation ? parts[0]?.trim() : "default";
        const snapshotDate = hasLocation ? parts[1]?.trim() : parts[0]?.trim();
        const revenueRaw = hasLocation ? parts[2] : parts[1];
        const revenue = Number(revenueRaw?.trim());

        if (!snapshotDate || !isIsoDate(snapshotDate) || Number.isNaN(revenue)) {
          continue;
        }

        const key = location || "default";

        if (!grouped[key]) {
          grouped[key] = [];
        }

        grouped[key].push({
          snapshot_date: snapshotDate,
          revenue,
        });
      }

      if (!Object.keys(grouped).length) continue;

      for (const locationName of Object.keys(grouped)) {
        const locationRows = grouped[locationName];
        if (!locationRows.length) continue;

        const businessName =
          locationName === "default"
            ? parentBusiness.name
            : `${parentBusiness.name} — ${locationName}`;

        let locationBusinessId = parentBusiness.id;

        if (locationName !== "default") {
          const { data: existingBusiness } = await supabase
            .from("businesses")
            .select("id")
            .eq("name", businessName)
            .eq("alert_email", parentBusiness.alert_email)
            .maybeSingle();

          if (existingBusiness?.id) {
            locationBusinessId = existingBusiness.id;
          } else {
            const { data: createdBusiness, error: createBusinessErr } =
              await supabase
                .from("businesses")
                .insert({
                  name: businessName,
                  alert_email: parentBusiness.alert_email,
                  timezone: parentBusiness.timezone ?? null,
                })
                .select("id")
                .single();

            if (createBusinessErr || !createdBusiness?.id) {
              continue;
            }

            locationBusinessId = createdBusiness.id;
          }
        }

        const { data: existingLocationSource } = await supabase
          .from("sources")
          .select("id")
          .eq("business_id", locationBusinessId)
          .eq("type", "google_sheets_revenue")
          .maybeSingle();

        let locationSourceId = existingLocationSource?.id ?? null;

        if (!locationSourceId) {
          const { data: createdSource, error: createSourceErr } = await supabase
            .from("sources")
            .insert({
              business_id: locationBusinessId,
              type: "google_sheets_revenue",
              display_name: "Google Sheets (Revenue)",
              is_connected: true,
              config: {
                sheet_url: source.config?.sheet_url ?? null,
                csv_url: csvUrl,
                location: locationName === "default" ? null : locationName,
                created_via: "sheets_sync",
              },
              meta: {
                created_at: new Date().toISOString(),
              },
            })
            .select("id")
            .single();

          if (createSourceErr || !createdSource?.id) {
            continue;
          }

          locationSourceId = createdSource.id;
        } else {
          await supabase
            .from("sources")
            .update({
              is_connected: true,
              display_name: "Google Sheets (Revenue)",
              config: {
                ...(source.config ?? {}),
                csv_url: csvUrl,
                location: locationName === "default" ? null : locationName,
                updated_at: new Date().toISOString(),
              },
            })
            .eq("id", locationSourceId);
        }

        const snapshots = locationRows.map((row) => ({
          business_id: locationBusinessId,
          source_id: locationSourceId,
          snapshot_date: row.snapshot_date,
          metrics: {
            revenue: row.revenue,
          },
        }));

        const uniqueDates = new Set(snapshots.map((row) => row.snapshot_date));
        if (uniqueDates.size !== snapshots.length) {
          continue;
        }

        const { error: snapshotErr } = await supabase
          .from("snapshots")
          .upsert(snapshots, {
            onConflict: "source_id,snapshot_date",
          });

        if (snapshotErr) {
          continue;
        }

        await supabase
          .from("businesses")
          .update({
            needs_compute: true,
            last_ingested_at: new Date().toISOString(),
          })
          .eq("id", locationBusinessId);
      }
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