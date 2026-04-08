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
  return header
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .toLowerCase();
}

function splitCsvLine(line: string) {
  return line
    .replace(/^\uFEFF/, "")
    .split(/[,\t]/)
    .map((part) => part.replace(/^["']|["']$/g, "").trim());
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

    console.log("SYNC: connected google sheets sources", {
      count: sources?.length ?? 0,
    });

    for (const source of sources ?? []) {
      const csvUrl = source.config?.csv_url as string | undefined;

      console.log("SYNC: Processing source", {
        sourceId: source.id,
        businessId: source.business_id,
        csvUrl,
      });

      if (!csvUrl) {
        console.log("SYNC: Skipping source with missing csvUrl", {
          sourceId: source.id,
          businessId: source.business_id,
        });
        continue;
      }

      const csvRes = await fetch(csvUrl, { cache: "no-store" });

      console.log("SYNC: Fetch status", {
        sourceId: source.id,
        businessId: source.business_id,
        status: csvRes.status,
        ok: csvRes.ok,
      });

      if (!csvRes.ok) {
        continue;
      }

      const rawText = await csvRes.text();

      console.log("SYNC RAW RESPONSE:", rawText.slice(0, 500));

      const text = rawText.replace(/^\uFEFF/, "");
      const rows = text
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean);

      console.log("SYNC: First 3 rows", rows.slice(0, 3));

      if (rows.length < 2) {
        console.log("SYNC: Skipping source with fewer than 2 rows", {
          sourceId: source.id,
          businessId: source.business_id,
          rowCount: rows.length,
        });
        continue;
      }

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

      console.log("SYNC: Header check", {
        sourceId: source.id,
        businessId: source.business_id,
        normalizedHeader,
        isSingleLocation,
        isMultiLocation,
      });

      if (!isSingleLocation && !isMultiLocation) {
        console.log("SYNC: Skipping source due to invalid header", {
          sourceId: source.id,
          businessId: source.business_id,
          normalizedHeader,
        });
        continue;
      }

      const { data: parentBusiness, error: parentBusinessErr } = await supabase
        .from("businesses")
        .select("id,name,alert_email,timezone")
        .eq("id", source.business_id)
        .maybeSingle();

      if (parentBusinessErr || !parentBusiness) {
        console.log("SYNC: Skipping source due to missing parent business", {
          sourceId: source.id,
          businessId: source.business_id,
          error: parentBusinessErr?.message ?? null,
        });
        continue;
      }

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

      console.log("SYNC: Grouped result", {
        sourceId: source.id,
        businessId: source.business_id,
        locations: Object.keys(grouped),
      });

      if (!Object.keys(grouped).length) {
        console.log("SYNC: Skipping source because grouped result is empty", {
          sourceId: source.id,
          businessId: source.business_id,
        });
        continue;
      }

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
            console.log("SYNC: Failed looking up existing child business", {
              sourceId: source.id,
              businessId: source.business_id,
              location,
              error: existingBusinessErr.message,
            });
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
              console.log("SYNC: Failed creating child business", {
                sourceId: source.id,
                businessId: source.business_id,
                location,
                error: createBusinessErr?.message ?? "Unknown create business error",
              });
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
          console.log("SYNC: Failed looking up existing location source", {
            sourceId: source.id,
            businessId: source.business_id,
            locationBusinessId,
            error: existingSourceErr.message,
          });
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
            console.log("SYNC: Failed creating location source", {
              sourceId: source.id,
              businessId: source.business_id,
              locationBusinessId,
              error: createSourceErr?.message ?? "Unknown create source error",
            });
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
          console.log("SYNC: Snapshot upsert failed", {
            sourceId: source.id,
            businessId: source.business_id,
            locationBusinessId,
            error: snapshotErr.message,
          });
          continue;
        }

        console.log("SYNC: Marking business for compute", {
          sourceId: source.id,
          businessId: source.business_id,
          locationBusinessId,
        });

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