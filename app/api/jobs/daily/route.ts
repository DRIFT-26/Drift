import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift } from "@/lib/drift/compute";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toNum(v: any) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function sum(rows: any[], key: string) {
  return (rows ?? []).reduce((acc, r) => acc + toNum(r?.metrics?.[key]), 0);
}

// Net revenue = revenue - refunds
function netFrom(rows: any[]) {
  return sum(rows, "revenue_cents") - sum(rows, "refunds_cents");
}

function refundRateFrom(rows: any[]) {
  const rev = sum(rows, "revenue_cents");
  const ref = sum(rows, "refunds_cents");
  if (rev <= 0) return 0;
  return ref / rev;
}

export async function POST(req: Request) {
  const supabase = supabaseAdmin();

  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const dryRun = url.searchParams.get("dry_run") === "true";
  const forceEmail = url.searchParams.get("force_email") === "true";
  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");

  const startedAt = Date.now();

  // Windows
  const today = new Date(); // UTC-ish is fine since snapshot_date is a date string
  const currentDays = 14;
  const baselineDays = 60;
  const priorDays = 14;

  const currentEnd = isoDate(today);
  const currentStart = isoDate(addDays(today, -(currentDays - 1)));

  const baselineEnd = isoDate(addDays(today, -currentDays));
  const baselineStart = isoDate(addDays(today, -(currentDays + baselineDays - 1)));

  const priorEnd = isoDate(addDays(today, -currentDays));
  const priorStart = isoDate(addDays(today, -(currentDays + priorDays - 1)));

  // Read businesses
  let bq = supabase
    .from("businesses")
    .select("id,name,timezone,alert_email,is_paid,monthly_revenue_cents");

  if (filterBusinessId) bq = bq.eq("id", filterBusinessId);

  const { data: businesses, error: bErr } = await bq;
  if (bErr) {
    return NextResponse.json(
      { ok: false, step: "read_businesses", error: bErr.message },
      { status: 500 }
    );
  }

  const results: any[] = [];

  for (const biz of businesses ?? []) {
    // Start job_run (best-effort; don’t crash if schema cache is stale)
    let bizRun: any = null;
    try {
      const { data } = await supabase
        .from("job_runs")
        .insert({
          job_name: "daily:business",
          business_id: biz.id,
          status: "started",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      bizRun = data ?? null;
    } catch {
      // ignore
    }

    try {
      // Connected sources
      let sq = supabase
        .from("sources")
        .select("id,type,is_connected")
        .eq("business_id", biz.id)
        .eq("is_connected", true);

      if (filterSourceId) sq = sq.eq("id", filterSourceId);

      const { data: connected, error: sErr } = await sq;
      if (sErr) throw new Error(`read_sources: ${sErr.message}`);

      const stripeSource = (connected ?? []).find((s: any) => s.type === "stripe_revenue");

      if (!stripeSource) {
        // No Stripe → skip revenue_v1
        if (bizRun?.id) {
          await supabase
            .from("job_runs")
            .update({ status: "success", finished_at: new Date().toISOString() })
            .eq("id", bizRun.id);
        }

        results.push({
          business_id: biz.id,
          name: biz.name,
          skipped: true,
          reason: "no_stripe_revenue_source",
          dry_run: dryRun,
          force_email: forceEmail,
          email_to: biz.alert_email ?? null,
          is_paid: (biz as any).is_paid ?? null,
          email_attempted: false,
          email_error: null,
          email_id: null,
          email_debug: null,
        });
        continue;
      }

      // Pull snapshots for baseline + current + prior in one fetch
      const earliest = priorStart < baselineStart ? priorStart : baselineStart;

      const { data: rows, error: snapErr } = await supabase
        .from("snapshots")
        .select("snapshot_date,metrics,source_id")
        .eq("business_id", biz.id)
        .eq("source_id", stripeSource.id)
        .gte("snapshot_date", earliest)
        .lte("snapshot_date", currentEnd);

      if (snapErr) throw new Error(`read_snapshots: ${snapErr.message}`);

      const all = rows ?? [];

      // Window filters (snapshot_date is YYYY-MM-DD)
      const baselineRows = all.filter(
        (r: any) => r.snapshot_date >= baselineStart && r.snapshot_date <= baselineEnd
      );

      const currentRows = all.filter(
        (r: any) => r.snapshot_date >= currentStart && r.snapshot_date <= currentEnd
      );

      const priorRows = all.filter(
        (r: any) => r.snapshot_date >= priorStart && r.snapshot_date <= priorEnd
      );

      // Compute revenue + refunds from metrics keys that exist
      const baselineNet60d = netFrom(baselineRows);
      const currentNet14d = netFrom(currentRows);
      const priorNet14d = netFrom(priorRows);

      // Scale baseline 60d → 14d using window days (NOT number of rows)
      const baselineNet14d = Math.round((baselineNet60d / baselineDays) * currentDays);

      const baselineRefundRate = refundRateFrom(baselineRows);
      const currentRefundRate = refundRateFrom(currentRows);

      const drift = computeDrift({
        baselineNetRevenue60d: baselineNet60d,
        currentNetRevenue14d: currentNet14d,
        priorNetRevenue14d: priorNet14d,
        baselineRefundRate,
        currentRefundRate,
      });

      // Compare with last status
      const { data: lastAlert } = await supabase
        .from("alerts")
        .select("status")
        .eq("business_id", biz.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastStatus = (lastAlert as any)?.status ?? null;
      const statusChanged = lastStatus !== drift.status;

      // Write alert only if changed and not dry-run
      let alertInserted = false;
      if (!dryRun && statusChanged) {
        const { error: insErr } = await supabase.from("alerts").insert({
          business_id: biz.id,
          status: drift.status,
          reasons: drift.reasons,
          window_start: currentStart,
          window_end: currentEnd,
          meta: drift.meta ?? null,
        });

        if (insErr) throw new Error(`insert_alert: ${insErr.message}`);
        alertInserted = true;

        // Keep business cache updated
        await supabase
          .from("businesses")
          .update({
            last_drift: drift,
            last_drift_at: new Date().toISOString(),
          })
          .eq("id", biz.id);
      }

      // Email logic
      let emailAttempted = false;
      let emailId: string | null = null;
      let emailError: string | null = null;
      let emailDebug: any = null;

      const isPaid = (biz as any)?.is_paid ?? false;
      const shouldEmail = !!biz.alert_email && isPaid && (forceEmail || statusChanged);

      if (!dryRun && shouldEmail) {
        emailAttempted = true;
        try {
          const { subject, text } = renderStatusEmail({
            businessName: biz.name,
            status: drift.status as any, // template expects stable/softening/attention
            reasons: drift.reasons,
            windowStart: currentStart,
            windowEnd: currentEnd,
          });

          const sent = await sendDriftEmail({
            to: biz.alert_email,
            subject,
            text,
          });

          emailId = (sent as any)?.id ?? null;
          emailDebug = sent ?? null;
        } catch (e: any) {
          emailError = e?.message ?? String(e);
        }
      }

      if (bizRun?.id) {
        await supabase
          .from("job_runs")
          .update({ status: "success", finished_at: new Date().toISOString() })
          .eq("id", bizRun.id);
      }

      results.push({
        business_id: biz.id,
        name: biz.name,
        drift: {
          ...drift,
          meta: {
            ...(drift.meta ?? {}),
            // Ensure these show the corrected numbers in meta
            revenue: {
              baselineNetRevenueCents14d: baselineNet14d,
              currentNetRevenueCents14d: currentNet14d,
              deltaPct:
                baselineNet14d <= 0
                  ? currentNet14d > 0
                    ? 1
                    : 0
                  : (currentNet14d - baselineNet14d) / baselineNet14d,
            },
            refunds: {
              baselineRefundRate,
              currentRefundRate,
              delta: currentRefundRate - baselineRefundRate,
            },
          },
        },
        last_status: lastStatus,
        status_changed: statusChanged,
        alert_inserted: alertInserted,
        dry_run: dryRun,
        force_email: forceEmail,
        email_to: biz.alert_email ?? null,
        is_paid: isPaid,
        email_attempted: emailAttempted,
        email_error: emailError,
        email_id: emailId,
        email_debug: emailDebug,
        ...(debug
          ? {
              debug: {
                windows: {
                  baselineStart,
                  baselineEnd,
                  currentStart,
                  currentEnd,
                  priorStart,
                  priorEnd,
                },
                sums: {
                  baselineGross60d: sum(baselineRows, "revenue_cents"),
                  baselineRefunds60d: sum(baselineRows, "refunds_cents"),
                  baselineNet60d,
                  baselineNet14d,
                  currentGross14d: sum(currentRows, "revenue_cents"),
                  currentRefunds14d: sum(currentRows, "refunds_cents"),
                  currentNet14d,
                  priorNet14d,
                },
                counts: {
                  baselineRows: baselineRows.length,
                  currentRows: currentRows.length,
                  priorRows: priorRows.length,
                },
              },
            }
          : {}),
      });
    } catch (e: any) {
      if (bizRun?.id) {
        await supabase
          .from("job_runs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error: e?.message ?? String(e),
          })
          .eq("id", bizRun.id);
      }

      results.push({
        business_id: biz.id,
        name: biz.name,
        ok: false,
        error: e?.message ?? String(e),
        dry_run: dryRun,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    businesses_processed: (businesses ?? []).length,
    duration_ms: Date.now() - startedAt,
    filters: {
      business_id: filterBusinessId ?? null,
      source_id: filterSourceId ?? null,
    },
    results,
  });
}