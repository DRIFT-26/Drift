import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderMonitoringStartedEmail } from "@/lib/email/templates";

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
  return line.split(",").map((part) => part.trim());
}

function displayLocationName(value: string) {
  if (value === "default") return value;

  return value
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const businessId = formData.get("business_id") as string | null;

    if (!file || !businessId) {
      return NextResponse.json(
        { ok: false, error: "Missing file or business_id" },
        { status: 400 }
      );
    }

    const { data: parentBusiness, error: parentBusinessErr } = await supabase
      .from("businesses")
      .select("id,name,alert_email,timezone")
      .eq("id", businessId)
      .single();

    if (parentBusinessErr || !parentBusiness) {
      return NextResponse.json(
        { ok: false, error: parentBusinessErr?.message ?? "Business not found" },
        { status: 404 }
      );
    }

    const text = (await file.text()).replace(/^\uFEFF/, "");
    const rows = text
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter(Boolean);

    if (rows.length < 2) {
      return NextResponse.json(
        { ok: false, error: "CSV must contain header + data rows" },
        { status: 400 }
      );
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

    if (!isSingleLocation && !isMultiLocation) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Accepted CSV format: Date,Revenue or Location,Date,Revenue (case-insensitive)",
        },
        { status: 400 }
      );
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

    if (!Object.keys(grouped).length) {
      return NextResponse.json(
        { ok: false, error: "No valid rows detected" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://drifthq.co";

    for (const location of Object.keys(grouped)) {
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
          const { data: createdBusiness, error: createdBusinessErr } =
            await supabase
              .from("businesses")
              .insert({
                name: businessName,
                alert_email: parentBusiness.alert_email,
                timezone: parentBusiness.timezone ?? DEFAULT_TIMEZONE,
              })
              .select("id")
              .single();

          if (createdBusinessErr || !createdBusiness?.id) {
            continue;
          }

          locationBusinessId = createdBusiness.id;
        }
      }

      const { data: existingSource, error: existingSourceErr } = await supabase
        .from("sources")
        .select("id")
        .eq("business_id", locationBusinessId)
        .eq("type", "csv_revenue")
        .maybeSingle();

      if (existingSourceErr) {
        continue;
      }

      let locationSourceId = existingSource?.id ?? null;

      if (!locationSourceId) {
        const { data: createdSource, error: createdSourceErr } = await supabase
          .from("sources")
          .insert({
            business_id: locationBusinessId,
            type: "csv_revenue",
            display_name: "CSV (Revenue)",
            is_connected: true,
            config: {
              created_via: "csv_upload",
              location: location === "default" ? null : locationDisplayName,
            },
            meta: {
              created_at: new Date().toISOString(),
            },
          })
          .select("id")
          .single();

        if (createdSourceErr || !createdSource?.id) {
          continue;
        }

        locationSourceId = createdSource.id;
      } else {
        await supabase
          .from("sources")
          .update({
            is_connected: true,
            display_name: "CSV (Revenue)",
            config: {
              created_via: "csv_upload",
              location: location === "default" ? null : locationDisplayName,
              updated_at: new Date().toISOString(),
            },
          })
          .eq("id", locationSourceId);
      }

      const snapshots = grouped[location].map((row) => ({
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

      await fetch(`${appUrl}/api/internal/compute-first`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business_id: locationBusinessId,
          force_email: true,
        }),
      });
    }

    if (parentBusiness.alert_email) {
      const { subject, text } = renderMonitoringStartedEmail({
        businessName: parentBusiness.name,
        source: "CSV Upload",
      });

      await sendDriftEmail({
        to: parentBusiness.alert_email,
        subject,
        text,
      });
    }

    return NextResponse.json({
      ok: true,
      locations_detected: Object.keys(grouped).length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "CSV ingestion failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}