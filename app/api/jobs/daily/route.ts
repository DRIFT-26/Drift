// app/api/jobs/daily/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift } from "@/lib/drift/compute";
import { sendDriftEmail } from "@/lib/email/resend";

export const runtime = "nodejs";

type DriftStatus = "stable" | "watch" | "softening" | "attention";

function requireCronAuth(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return null; // allow if not configured (dev)
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  return token === secret ? null : "Unauthorized";
}

function isoDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function toNum(v: any) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function sumMetric(rows: any[], key: string) {
  return rows.reduce((acc, r) => acc + toNum(r?.metrics?.[key]), 0);
}

function netFrom(rows: any[]) {
  const gross = sumMetric(rows, "revenue_cents");
  const refunds = sumMetric(rows, "refunds_cents");
  return gross - refunds;
}

function safeRefundRate(gross: number, refunds: number) {
  return gross > 0 ? refunds / gross : 0;
}

function mapStatusForEmail(status: DriftStatus): "stable" | "softening" | "attention" {
  // Our email template expects stable/softening/attention
  if (status === "stable") return "stable";
  if (status === "softening") return "softening";
  // watch + attention -> attention
  return "attention";
}

function formatPct(x: number) {
  const p = x * 100;
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function formatMoneyFromCents(cents: number) {
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export async function POST(req: Request) {
  const authErr = requireCronAuth(req);
  if (authErr) return NextResponse.json({ ok: false, error: authErr }, { status: 401 });

  const supabase = supabaseAdmin();
  const url = new URL(req.url);

  const dryRun = url.searchParams.get("dry_run") === "true";
  const debug = url.searchParams.get("debug") === "1" || url.searchParams.get("debug") === "true";
  const forceEmail = url.searchParams.get("force_email") === "true";
  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");

  const t0 = Date.now();

  // Windows (UTC day boundaries)
  const today = new Date(); // now (UTC)
  const currentEnd = isoDate(today); // inclusive end label (today)
  const currentStart = isoDate(addDaysUTC(today, -13)); // last 14 days including today

  const priorEnd = isoDate(addDaysUTC(today, -14));
  const priorStart = isoDate(addDaysUTC(today, -27));

  // baseline is the 60d period BEFORE currentStart (does not overlap current)
  const baselineEnd = isoDate(addDaysUTC(today, -14)); // same as priorEnd
  const baselineStart = isoDate(addDaysUTC(today, -73)); // 60 days ending at baselineEnd (inclusive)
  const earliest = baselineStart; // we only need baseline+prior+current

  // 1) Read businesses
  let bq = supabase
    .from("businesses")
    // IMPORTANT: only select columns we know exist in your schema (based on your /api/alerts route)
    .select("id,name,timezone,alert_email,is_paid,monthly_revenue");

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
    // 2) job_runs: start (NO meta column — avoids schema cache issue)
    const { data: bizRun } = await supabase
      .from("job_runs")
      .insert({
        job_name: "daily:business",
        business_id: biz.id,
        status: "started",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    try {
      // 3) Read connected sources
      let sq = supabase
        .from("sources")
        .select("id,type,is_connected,config")
        .eq("business_id", biz.id)
        .eq("is_connected", true);

      if (filterSourceId) sq = sq.eq("id", filterSourceId);

      const { data: connected, error: sErr } = await sq;
      if (sErr) throw new Error(`read_sources: ${sErr.message}`);

      const stripeSource = (connected ?? []).find((s: any) => s.type === "stripe_revenue");

      if (!stripeSource) {
        await supabase
          .from("job_runs")
          .update({ status: "success", finished_at: new Date().toISOString() })
          .eq("id", bizRun?.id);

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

      // 4) Pull snapshots (single fetch)
      const snapQ = supabase
        .from("snapshots")
        .select("snapshot_date,metrics")
        .eq("business_id", biz.id)
        .eq("source_id", stripeSource.id)
        .gte("snapshot_date", earliest);

      const { data: rows, error: snapErr } = await snapQ;
      if (snapErr) throw new Error(`read_snapshots: ${snapErr.message}`);

      const all = rows ?? [];

      // Partition by window boundaries (YYYY-MM-DD compares lexicographically)
      const baselineRows = all.filter((r: any) => r.snapshot_date >= baselineStart && r.snapshot_date <= baselineEnd);
      const priorRows = all.filter((r: any) => r.snapshot_date >= priorStart && r.snapshot_date <= priorEnd);
      const currentRows = all.filter((r: any) => r.snapshot_date >= currentStart && r.snapshot_date <= currentEnd);

      // Sums (gross/refunds/net)
      const baselineGross60d = sumMetric(baselineRows, "revenue_cents");
      const baselineRefunds60d = sumMetric(baselineRows, "refunds_cents");
      const baselineNet60d = baselineGross60d - baselineRefunds60d;

      const currentGross14d = sumMetric(currentRows, "revenue_cents");
      const currentRefunds14d = sumMetric(currentRows, "refunds_cents");
      const currentNet14d = currentGross14d - currentRefunds14d;

      const priorGross14d = sumMetric(priorRows, "revenue_cents");
      const priorRefunds14d = sumMetric(priorRows, "refunds_cents");
      const priorNet14d = priorRows.length ? priorGross14d - priorRefunds14d : null;

      // Normalize baseline 60d -> 14d equivalent
      const baselineNet14d = Math.round((baselineNet60d / 60) * 14);

      // Baseline guardrails: if baseline gross is basically empty, neutralize baseline comparisons
      const MIN_BASELINE_GROSS_CENTS = 10_000; // $100
      const baselineHasHistory = baselineGross60d >= MIN_BASELINE_GROSS_CENTS;

      const currentRefundRate = safeRefundRate(currentGross14d, currentRefunds14d);
      const computedBaselineRefundRate = safeRefundRate(baselineGross60d, baselineRefunds60d);
      const baselineRefundRate = baselineHasHistory ? computedBaselineRefundRate : currentRefundRate;

      // 5) Compute drift (Revenue v1)
      const drift = computeDrift({
        baselineNetRevenue60d: baselineNet60d,
        currentNetRevenue14d: currentNet14d,
        priorNetRevenue14d: priorNet14d,
        baselineRefundRate,
        currentRefundRate,
      });

      // Ensure engine + direction are present (computeDrift should set, but guard anyway)
      drift.meta = drift.meta ?? {};
      drift.meta.engine = drift.meta.engine ?? "revenue_v1";
      drift.meta.direction = drift.meta.direction ?? "flat";

      // If baseline is warming up, annotate
      if (!baselineHasHistory) {
        drift.reasons = [
          {
            code: "BASELINE_WARMUP",
            detail: "Building baseline — need more history for comparisons",
          },
          ...(drift.reasons ?? []),
        ];
      }

      // 6) Determine status change vs last_drift.status
      const { data: bizRow } = await supabase
        .from("businesses")
        .select("last_drift")
        .eq("id", biz.id)
        .single();

      const lastStatus: DriftStatus | null = (bizRow as any)?.last_drift?.status ?? null;
      const statusChanged = !!lastStatus && lastStatus !== drift.status;

      // 7) Write back last_drift + timestamp (+ optional alert insert)
      if (!dryRun) {
        await supabase
          .from("businesses")
          .update({
            last_drift: drift,
            last_drift_at: new Date().toISOString(),
          })
          .eq("id", biz.id);

        if (statusChanged) {
          await supabase.from("alerts").insert({
            business_id: biz.id,
            status: drift.status,
            reasons: drift.reasons ?? [],
            window_start: currentStart,
            window_end: currentEnd,
            meta: null,
          });
        }
      }

      // 8) Email rules:
      // - Only paid
      // - Send if force_email or status changed (and we have an email)
      const isPaid = !!(biz as any).is_paid;
      let emailAttempted = false;
      let emailError: string | null = null;

      if (biz.alert_email && isPaid && (forceEmail || statusChanged) && !dryRun) {
        emailAttempted = true;

        const emailStatus = mapStatusForEmail(drift.status as DriftStatus);

        const rev = drift.meta?.revenue ?? {};
        const refunds = drift.meta?.refunds ?? {};

        const subject =
          emailStatus === "stable"
            ? `DRIFT: Stable — ${biz.name}`
            : emailStatus === "softening"
              ? `DRIFT: Softening — ${biz.name}`
              : `DRIFT: Attention — ${biz.name}`;

        const lines: string[] = [];
        lines.push(`Business: ${biz.name}`);
        lines.push(`Engine: revenue_v1`);
        lines.push(`Direction: ${String(drift.meta?.direction ?? "flat")}`);
        lines.push(`RMI Score: ${String(drift.meta?.mriScore ?? "")}`);
        lines.push("");
        lines.push(`Current (14d) net: ${formatMoneyFromCents(toNum(rev.currentNetRevenueCents14d ?? 0))}`);
        lines.push(`Baseline (14d equiv): ${formatMoneyFromCents(toNum(rev.baselineNetRevenueCents14d ?? 0))}`);
        lines.push(`Delta: ${formatPct(toNum(rev.deltaPct ?? 0))}`);
        lines.push("");
        lines.push(
          `Refund rate: ${(toNum(refunds.currentRefundRate ?? 0) * 100).toFixed(1)}% (baseline ${(toNum(refunds.baselineRefundRate ?? 0) * 100).toFixed(1)}%)`
        );
        lines.push("");

        if ((drift.reasons ?? []).length) {
          lines.push("Drivers:");
          for (const r of drift.reasons) {
            lines.push(`- ${r.detail}`);
          }
          lines.push("");
        } else {
          lines.push("Drivers: None (stable).");
          lines.push("");
        }

        try {
          await sendDriftEmail({
            to: String(biz.alert_email),
            subject,
            text: lines.join("\n"),
          });
        } catch (e: any) {
          emailError = e?.message ?? String(e);
        }
      }

      // 9) job_runs: success
      await supabase
        .from("job_runs")
        .update({ status: "success", finished_at: new Date().toISOString() })
        .eq("id", bizRun?.id);

      results.push({
        business_id: biz.id,
        name: biz.name,
        drift,
        last_status: lastStatus,
        status_changed: statusChanged,
        alert_inserted: !dryRun && statusChanged,
        dry_run: dryRun,
        force_email: forceEmail,
        email_to: biz.alert_email ?? null,
        is_paid: (biz as any).is_paid ?? null,
        email_attempted: emailAttempted,
        email_error: emailError,
        email_id: null,
        email_debug: null,
        ...(debug
          ? {
              debug: {
                windows: {
                  baseline: { start: baselineStart, end: baselineEnd, days: 60 },
                  prior: { start: priorStart, end: priorEnd, days: 14 },
                  current: { start: currentStart, end: currentEnd, days: 14 },
                },
                counts: {
                  baselineRows: baselineRows.length,
                  priorRows: priorRows.length,
                  currentRows: currentRows.length,
                },
                sums: {
                  baselineGross60d,
                  baselineRefunds60d,
                  baselineNet60d,
                  baselineNet14d,
                  currentGross14d,
                  currentRefunds14d,
                  currentNet14d,
                  priorNet14d: priorNet14d ?? 0,
                },
                rates: {
                  baselineHasHistory,
                  computedBaselineRefundRate,
                  baselineRefundRate,
                  currentRefundRate,
                },
              },
            }
          : {}),
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);

      await supabase
        .from("job_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), error: msg })
        .eq("id", bizRun?.id);

      results.push({
        business_id: biz.id,
        name: biz.name,
        ok: false,
        error: msg,
        dry_run: dryRun,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    businesses_processed: (businesses ?? []).length,
    duration_ms: Date.now() - t0,
    filters: {
      business_id: filterBusinessId ?? null,
      source_id: filterSourceId ?? null,
    },
    results,
  });
}