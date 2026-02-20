import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift } from "@/lib/drift/compute";

export const runtime = "nodejs";

const BASELINE_DAYS = 60;
const CURRENT_DAYS = 14;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  const supabase = supabaseAdmin();

  try {
    const { searchParams } = new URL(req.url);

    const dryRun = searchParams.get("dry_run") === "true";
    const debug = searchParams.get("debug") === "1";
    const filterBusinessId = searchParams.get("business_id");

    // ------------------------------------------------------------
    // Read businesses
    // ------------------------------------------------------------

    let bq = supabase
      .from("businesses")
      .select("id,name,timezone,alert_email,is_paid,last_drift")
      .order("created_at", { ascending: true });

    if (filterBusinessId) {
      bq = bq.eq("id", filterBusinessId);
    }

    const { data: businesses, error: bErr } = await bq;

    if (bErr) {
      return NextResponse.json({
        ok: false,
        step: "read_businesses",
        error: bErr.message,
      });
    }

    const results: any[] = [];

    // ------------------------------------------------------------
    // Date Windows
    // ------------------------------------------------------------

    const today = new Date();

    const currentEnd = daysAgo(0);
    const currentStart = daysAgo(CURRENT_DAYS - 1);

    const baselineEnd = daysAgo(CURRENT_DAYS);
    const baselineStart = daysAgo(CURRENT_DAYS + BASELINE_DAYS - 1);

    const priorEnd = daysAgo(CURRENT_DAYS);
    const priorStart = daysAgo(CURRENT_DAYS * 2 - 1);

    const currentStartStr = isoDate(currentStart);
    const currentEndStr = isoDate(currentEnd);
    const baselineStartStr = isoDate(baselineStart);
    const baselineEndStr = isoDate(baselineEnd);
    const priorStartStr = isoDate(priorStart);
    const priorEndStr = isoDate(priorEnd);

    for (const biz of businesses ?? []) {
      // ------------------------------------------------------------
      // Find stripe revenue source
      // ------------------------------------------------------------

      const { data: connected } = await supabase
        .from("sources")
        .select("id,type")
        .eq("business_id", biz.id)
        .eq("is_connected", true);

      const stripeSource = connected?.find(
        (s: any) => s.type === "stripe_revenue"
      );

      if (!stripeSource) {
        results.push({
          business_id: biz.id,
          name: biz.name,
          skipped: true,
          reason: "no_stripe_revenue_source",
        });
        continue;
      }

      // ------------------------------------------------------------
      // Pull snapshots
      // ------------------------------------------------------------

      const earliest =
        priorStartStr < baselineStartStr ? priorStartStr : baselineStartStr;

      const { data: rows, error: snapErr } = await supabase
        .from("snapshots")
        .select("snapshot_date,metrics")
        .eq("business_id", biz.id)
        .eq("source_id", stripeSource.id)
        .gte("snapshot_date", earliest);

      if (snapErr) {
        return NextResponse.json({
          ok: false,
          step: "read_snapshots",
          error: snapErr.message,
        });
      }

      const all = rows ?? [];

      // ------------------------------------------------------------
      // Helpers
      // ------------------------------------------------------------

      const toNum = (v: any) => {
        const n = typeof v === "string" ? Number(v) : v;
        return Number.isFinite(n) ? n : 0;
      };

      const sum = (rows: any[], key: string) =>
        rows.reduce((acc, r) => acc + toNum(r?.metrics?.[key]), 0);

      const netFrom = (rows: any[]) =>
        sum(rows, "revenue_cents") - sum(rows, "refunds_cents");

      const refundRateFrom = (rows: any[]) => {
        const rev = sum(rows, "revenue_cents");
        const ref = sum(rows, "refunds_cents");
        if (rev <= 0) return 0;
        return ref / rev;
      };

      // ------------------------------------------------------------
      // Window slices (bounded properly)
      // ------------------------------------------------------------

      const baselineRows = all.filter(
        (r: any) =>
          r.snapshot_date >= baselineStartStr &&
          r.snapshot_date <= baselineEndStr
      );

      const currentRows = all.filter(
        (r: any) =>
          r.snapshot_date >= currentStartStr &&
          r.snapshot_date <= currentEndStr
      );

      const priorRows = all.filter(
        (r: any) =>
          r.snapshot_date >= priorStartStr &&
          r.snapshot_date <= priorEndStr
      );

      const baselineDays = Math.max(1, baselineRows.length);
      const currentDays = Math.max(1, currentRows.length);

      // ------------------------------------------------------------
      // Revenue calculations
      // ------------------------------------------------------------

      const baselineNetRevenueCents60d = netFrom(baselineRows);
      const currentNetRevenueCents14d = netFrom(currentRows);
      const priorNetRevenueCents14d = priorRows.length
        ? netFrom(priorRows)
        : null;

      // Normalize baseline to 14d equivalent
      const baselineNetRevenueCents14d = Math.round(
        (baselineNetRevenueCents60d / baselineDays) * currentDays
      );

      const baselineRefundRate = refundRateFrom(baselineRows);
      const currentRefundRate = refundRateFrom(currentRows);

      // ------------------------------------------------------------
      // Drift Engine
      // ------------------------------------------------------------

      const drift = computeDrift({
        baselineNetRevenueCents14d,
        currentNetRevenueCents14d,
        priorNetRevenueCents14d,
        baselineRefundRate,
        currentRefundRate,
      });

      // ------------------------------------------------------------
      // Persist (if not dry run)
      // ------------------------------------------------------------

      if (!dryRun) {
        await supabase
          .from("businesses")
          .update({
            last_drift: drift,
            last_drift_at: new Date().toISOString(),
          })
          .eq("id", biz.id);
      }

      results.push({
        business_id: biz.id,
        name: biz.name,
        drift,
        dry_run: dryRun,
      });
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      businesses_processed: results.length,
      duration_ms: Date.now() - startTime,
      filters: {
        business_id: filterBusinessId ?? null,
      },
      results,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message ?? String(e),
    });
  }
}