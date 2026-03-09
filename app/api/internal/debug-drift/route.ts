import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function computeRevenueDrift(baseline: number, current: number) {
  if (baseline <= 0) {
    return {
      status: "watch",
      deltaPct: 0,
      reasons: ["Not enough baseline revenue history to classify confidently."]
    };
  }

  const deltaPct = (current - baseline) / baseline;

  if (deltaPct <= -0.2) {
    return {
      status: "attention",
      deltaPct,
      reasons: [
        `Revenue is down ${Math.abs(deltaPct * 100).toFixed(0)}% vs baseline.`,
        "The deviation is materially outside the expected range."
      ]
    };
  }

  if (deltaPct <= -0.1) {
    return {
      status: "softening",
      deltaPct,
      reasons: [
        `Revenue is down ${Math.abs(deltaPct * 100).toFixed(0)}% vs baseline.`,
        "The trend is softening and should be reviewed."
      ]
    };
  }

  if (deltaPct <= -0.05) {
    return {
      status: "watch",
      deltaPct,
      reasons: [
        `Revenue is down ${Math.abs(deltaPct * 100).toFixed(0)}% vs baseline.`,
        "Early movement has been detected relative to baseline."
      ]
    };
  }

  return {
    status: "stable",
    deltaPct,
    reasons: ["Revenue is tracking within the expected baseline range."]
  };
}

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();

  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id");

  if (!businessId) {
    return NextResponse.json(
      { ok: false, error: "business_id required" },
      { status: 400 }
    );
  }

  const baselineDays = 60;
  const currentDays = 14;

  const { data: latest } = await supabase
    .from("snapshots")
    .select("snapshot_date")
    .eq("business_id", businessId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .single();

  if (!latest) {
    return NextResponse.json({ ok: false, error: "No snapshots found" });
  }

  const anchorDate = new Date(latest.snapshot_date);

  const baselineStart = new Date(anchorDate);
  baselineStart.setDate(anchorDate.getDate() - baselineDays);

  const currentStart = new Date(anchorDate);
  currentStart.setDate(anchorDate.getDate() - currentDays);

  const baselineStartStr = isoDate(baselineStart);
  const currentStartStr = isoDate(currentStart);
  const anchorDateStr = isoDate(anchorDate);

  const { data: baselineRows } = await supabase
    .from("snapshots")
    .select("metrics")
    .eq("business_id", businessId)
    .gte("snapshot_date", baselineStartStr)
    .lte("snapshot_date", anchorDateStr);

  const { data: currentRows } = await supabase
    .from("snapshots")
    .select("metrics")
    .eq("business_id", businessId)
    .gte("snapshot_date", currentStartStr)
    .lte("snapshot_date", anchorDateStr);

  const sum = (rows: any[]) =>
    rows.reduce((acc, r) => acc + Number(r?.metrics?.revenue ?? 0), 0);

  const baselineRevenueWindow = sum(baselineRows || []);
  const currentRevenue14d = sum(currentRows || []);

  const baselineRevenue14d =
    (baselineRevenueWindow / baselineDays) * currentDays;

  const drift = computeRevenueDrift(baselineRevenue14d, currentRevenue14d);

  return NextResponse.json({
    ok: true,
    anchorDate: anchorDateStr,
    baselineRevenue14d,
    currentRevenue14d,
    deltaPct: drift.deltaPct,
    status: drift.status,
    reasons: drift.reasons
  });
}