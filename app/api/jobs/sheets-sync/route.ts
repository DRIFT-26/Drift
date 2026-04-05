import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_TIMEZONE = "America/Chicago";

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeLocation(value: string | undefined | null) {
  return (value || "default")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeHeader(header: string) {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function splitCsvLine(line: string) {
  const delimiter = line.includes("\t") ? "\t" : ",";
  return line.split(delimiter).map((part) => part.trim());
}

function displayLocationName(value: string) {
  if (value === "default") return value;

  return value
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
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

      const text = (await csvRes.text()).replace(/^\uFEFF/, "");
      const rows = text
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean);

      if (rows.length < 2) continue;

      const normalizedHeader = splitCsvLine(rows[0]).map(normalizeHeader);
      const isSingleLocation =
        normalizedHeader.length === 2 &&
        normalizedHeader[0] === "date" &&
        normalizedHeader[1] === "revenue";
      const isMultiLocation =
        normalizedHeader.length === 3 &&
        normalizedHeader[0] === "location" &&
        normalizedHeader[1] === "date" &&
        normalizedHeader[2] === "revenue";

      if (!isSingleLocation && !isMultiLocation) {
        continue;
      }

      const { data: parentBusiness, error: parentBusinessErr } = await supabase
        .from("businesses")
        .select("id,name,alert_email,timezone")
        .eq("id", source.business_id)
        .maybeSingle();

      if (parentBusinessErr || !parentBusiness) continue;

      const grouped: Record<
        string,
        Array<{ snapshot_date: string; revenue: number }>
      > = {};

      const uniqueLocationDateKeys = new Set<string>();

      for (const row of rows.slice(1)) {
        const parts = splitCsvLine(row);

        const rawLocation = isMultiLocation ? parts[0] : "default";
        const location = normalizeLocation(rawLocation);

        const snapshotDate = isMultiLocation ? parts[1] : parts[0];
        const revenueRaw = isMultiLocation ? parts[2] : parts[1];
        const revenue = Number(revenueRaw);

        if (!snapshotDate || !isIsoDate(snapshotDate) || Number.isNaN(revenue)) {
          continue;
        }

        const uniqueKey = `${location}:${snapshotDate}`;
        if (uniqueLocationDateKeys.has(uniqueKey)) {
          continue;
        }
        uniqueLocationDateKeys.add(uniqueKey);

        if (!grouped[location]) {
          grouped[location] = [];
        }

        grouped[location].push({
          snapshot_date: snapshotDate,
          revenue,
        });
      }

      if (!Object.keys(grouped).length) continue;

      for (const location of Object.keys(grouped)) {
        const locationRows = grouped[location];
        if (!locationRows.length) continue;

        const locationDisplayName = displayLocationName(location);

        const businessName =
          location === "default"
            ? parentBusiness.name
            : `${parentBusiness.name} — ${locationDisplayName}`;

        let locationBusinessId = parentBusiness.id;

        if (location !== "default") {
          const { data: existingBusiness, error: existingBusinessErr } =
            await supabase
              .from("businesses")
              .select("id")
              .eq("name", businessName)
              .eq("alert_email", parentBusiness.alert_email)
              .maybeSingle();

          if (existingBusinessErr) {
            continue;
          }

          if (existingBusiness?.id) {
            locationBusinessId = existingBusiness.id;
          } else {
            const { data: createdBusiness, error: createBusinessErr } =
              await supabase
                .from("businesses")
                .insert({
                  name: businessName,
                  alert_email: parentBusiness.alert_email,
                  timezone: parentBusiness.timezone ?? DEFAULT_TIMEZONE,
                })
                .select("id")
                .single();

            if (createBusinessErr || !createdBusiness?.id) {
              continue;
            }

            locationBusinessId = createdBusiness.id;
          }
        }

        const { data: existingLocationSource, error: existingSourceErr } =
          await supabase
            .from("sources")
            .select("id")
            .eq("business_id", locationBusinessId)
            .eq("type", "google_sheets_revenue")
            .maybeSingle();

        if (existingSourceErr) {
          continue;
        }

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
                location: location === "default" ? null : locationDisplayName,
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
                location: location === "default" ? null : locationDisplayName,
                updated_at: new Date().toISOString(),
              },
            })
            .eq("id", locationSourceId);
        }

        const snapshots = locationRows.map((row) => ({
          business_id: locationBusinessId,
          source_id: locationSourceId!,
          snapshot_date: row.snapshot_date,
          metrics: {
            revenue: row.revenue,
          },
        }));

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