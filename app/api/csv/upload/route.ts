import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderMonitoringStartedEmail } from "@/lib/email/templates";

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const businessId = formData.get("business_id") as string | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (!businessId) {
      return NextResponse.json(
        { ok: false, error: "Missing business_id" },
        { status: 400 }
      );
    }

    const { data: business, error: businessErr } = await supabase
  .from("businesses")
  .select("id,name,alert_email")
  .eq("id", businessId)
  .single();

    if (businessErr || !business) {
      return NextResponse.json(
        { ok: false, error: businessErr?.message ?? "Business not found" },
        { status: 404 }
      );
    }

    // Find or create the CSV revenue source for this business
    const { data: existingSource, error: sourceReadErr } = await supabase
      .from("sources")
      .select("id")
      .eq("business_id", businessId)
      .eq("type", "csv_revenue")
      .maybeSingle();

    if (sourceReadErr) {
      return NextResponse.json(
        { ok: false, error: sourceReadErr.message },
        { status: 500 }
      );
    }

    let sourceId = existingSource?.id ?? null;

    if (!sourceId) {
      const { data: createdSource, error: sourceCreateErr } = await supabase
        .from("sources")
        .insert({
          business_id: businessId,
          type: "csv_revenue",
          display_name: "CSV (Revenue)",
          is_connected: true,
          config: { created_via: "csv_upload" },
          meta: { created_at: new Date().toISOString() },
        })
        .select("id")
        .single();

      if (sourceCreateErr || !createdSource?.id) {
        return NextResponse.json(
          {
            ok: false,
            error: sourceCreateErr?.message ?? "Failed to create csv_revenue source",
          },
          { status: 500 }
        );
      }

      sourceId = createdSource.id;
    }

    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean);

    if (rows.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          error: "CSV must include a header row and at least one data row",
        },
        { status: 400 }
      );
    }

    // Expected:
    // date,revenue
    // 2026-01-01,1420
    const dataRows = rows.slice(1);

    const snapshotPayload: Array<{
      business_id: string;
      source_id: string;
      snapshot_date: string;
      metrics: { revenue: number };
    }> = [];

    for (const row of dataRows) {
      const [dateRaw, revenueRaw] = row.split(",");

      const snapshotDate = dateRaw?.trim();
      const revenue = Number(revenueRaw?.trim());

      if (!snapshotDate || !isIsoDate(snapshotDate) || Number.isNaN(revenue)) continue;

      snapshotPayload.push({
        business_id: businessId,
        source_id: sourceId,
        snapshot_date: snapshotDate,
        metrics: {
          revenue,
        },
      });
    }

    if (!snapshotPayload.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "No valid CSV rows found. Expected columns: date,revenue",
        },
        { status: 400 }
      );
    }

    const uniqueDates = new Set(snapshotPayload.map((row) => row.snapshot_date));

if (uniqueDates.size !== snapshotPayload.length) {
  return NextResponse.json(
    {
      ok: false,
      error: "CSV contains duplicate dates. Please include only one row per day.",
    },
    { status: 400 }
  );
}

if (snapshotPayload.length < 74) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "For the most accurate assessment and best results, include ~60 days of baseline revenue plus your most recent 14 days.",
    },
    { status: 400 }
  );
}

const sortedDates = [...uniqueDates].sort();
const earliest = sortedDates[0];
const latest = sortedDates[sortedDates.length - 1];

if (!earliest || !latest) {
  return NextResponse.json(
    { ok: false, error: "CSV must include valid revenue rows." },
    { status: 400 }
  );
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

    const { error: snapshotErr } = await supabase
  .from("snapshots")
  .upsert(snapshotPayload, {
    onConflict: "source_id,snapshot_date",
  });

    if (snapshotErr) {
      return NextResponse.json(
        { ok: false, error: snapshotErr.message },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://drifthq.co";

const computeRes = await fetch(`${appUrl}/api/internal/compute-first`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    business_id: businessId,
    force_email: true,
  }),
});

const computeJson = await computeRes.json().catch(() => null);

if (!computeRes.ok) {
  return NextResponse.json(
    {
      ok: false,
      error: computeJson?.error ?? "Failed to compute DRIFT signal after CSV upload",
    },
    { status: 500 }
  );
}

   await supabase
  .from("businesses")
  .update({
    needs_compute: true,
    last_ingested_at: new Date().toISOString(),
  })
  .eq("id", businessId); 

    

    if (business?.alert_email) {
  const { subject, text } = renderMonitoringStartedEmail({
    businessName: business.name,
    source: "CSV Upload",
  });

  await sendDriftEmail({
    to: business.alert_email,
    subject,
    text,
  });
}

    return NextResponse.json({
      ok: true,
      business_id: businessId,
      source_id: sourceId,
      rows_ingested: snapshotPayload.length,
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