import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const businessId = formData.get("business_id") as string | null;
    const company = formData.get("company") as string | null;
    const email = formData.get("email") as string | null;
    const timezone = formData.get("timezone") as string | null;

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

    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean);

    if (rows.length < 2) {
      return NextResponse.json(
        { ok: false, error: "CSV must include a header row and at least one data row" },
        { status: 400 }
      );
    }

    // expected format:
    // date,revenue
    // 2026-01-01,1420
    const dataRows = rows.slice(1);

    const snapshotPayload: Array<{
      business_id: string;
      snapshot_date: string;
      metrics: { revenue: number };
    }> = [];

    for (const row of dataRows) {
      const [dateRaw, revenueRaw] = row.split(",");

      const snapshotDate = dateRaw?.trim();
      const revenue = Number(revenueRaw?.trim());

      if (!snapshotDate || Number.isNaN(revenue)) continue;

      snapshotPayload.push({
        business_id: businessId,
        snapshot_date: snapshotDate,
        metrics: {
          revenue,
        },
      });
    }

    if (!snapshotPayload.length) {
      return NextResponse.json(
        { ok: false, error: "No valid CSV rows found. Expected columns: date,revenue" },
        { status: 400 }
      );
    }

    const { error: snapshotErr } = await supabase
      .from("snapshots")
      .insert(snapshotPayload);

    if (snapshotErr) {
      return NextResponse.json(
        { ok: false, error: snapshotErr.message },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json(
        { ok: false, error: "NEXT_PUBLIC_APP_URL is not configured" },
        { status: 500 }
      );
    }

    const computeRes = await fetch(`${appUrl}/api/internal/compute-first`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        business_id: businessId,
      }),
    });

    const computeJson = await computeRes.json().catch(() => null);

    if (!computeRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: computeJson?.error ?? "Failed to compute first DRIFT signal",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      business_id: businessId,
      rows_ingested: snapshotPayload.length,
      company: company ?? business.name ?? null,
      email: email ?? business.alert_email ?? null,
      timezone: timezone ?? null,
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