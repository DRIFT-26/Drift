import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift } from "@/lib/drift/compute";
import { sendDriftEmail } from "@/lib/email/resend";

export const runtime = "nodejs";

type DriftStatus = "stable" | "watch" | "softening" | "attention";

function json(ok: boolean, body: any, status = 200) {
  return NextResponse.json({ ok, ...body }, { status });
}

function bearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

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

function sumMetric(rows: any[], key: string) {
  return (rows ?? []).reduce((acc, r) => acc + toNum(r?.metrics?.[key]), 0);
}

function normalizeStatusForEmail(s: DriftStatus): Exclude<DriftStatus, "watch"> {
  // if your email template doesn't accept "watch", map it to softening
  return s === "watch" ? "softening" : s;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const supabase = supabaseAdmin();

  // ---- Auth
  const token = bearer(req);
  const expected = process.env.CRON_SECRET;
  if (!expected || token !== expected) {
    return json(false, { error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const forceEmail = url.searchParams.get("force_email") === "true";
  const debug = url.searchParams.get("debug") === "1" || url.searchParams.get("debug") === "true";
  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");

  // ---- Read businesses
  // IMPORTANT: only select columns you KNOW exist in your schema.
  // Based on your /api/alerts output, monthly_revenue exists (not monthly_revenue_cents).
  let bq = supabase
    .from("businesses")
    .select("id,name,timezone,alert_email,is_paid,last_drift,last_drift_at,monthly_revenue");

  if (filterBusinessId) bq = bq.eq("id", filterBusinessId);

  const { data: businesses, error: bErr } = await bq;

  if (bErr) {
    return json(false, { step: "read_businesses", error: bErr.message }, 500);
  }

  const results: any[] = [];

  // ---- Windows: baseline=60d ending 14d ago; prior=14d before current; current=last 14d
  const today = new Date();
  const currentEnd = today; // inclusive-ish; snapshots are daily dates, so we use date strings
  const currentStart = addDays(currentEnd, -13);

  const priorEnd = addDays(currentStart, -1);
  const priorStart = addDays(priorEnd, -13);

  const baselineEnd = priorEnd;
  const baselineStart = addDays(baselineEnd, -59);

  const currentStartStr = isoDate(currentStart);
  const currentEndStr = isoDate(currentEnd);
  const priorStartStr = isoDate(priorStart);
  const priorEndStr = isoDate(priorEnd);
  const baselineStartStr = isoDate(baselineStart);
  const baselineEndStr = isoDate(baselineEnd);

  for (const biz of businesses ?? []) {
    const bizRunStartedAt = new Date().toISOString();

    // --- start job_run (avoid meta column unless you're 100% sure it exists)
    let bizRunId: string | null = null;
    if (!dryRun) {
      const { data: jr, error: jrErr } = await supabase
        .from("job_runs")
        .insert({ job_name: "daily:business", business_id: biz.id, status: "started", started_at: bizRunStartedAt })
        .select("id")
        .single();

      if (jrErr) {
        results.push({
          business_id: biz.id,
          name: biz.name,
          skipped: true,
          reason: "job_runs_start_failed",
          error: jrErr.message,
          dry_run: dryRun,
        });
        continue;
      }
      bizRunId = jr?.id ?? null;
    }

    try {
      // ---- Read sources
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
        if (!dryRun && bizRunId) {
          await supabase
            .from("job_runs")
            .update({ status: "success", finished_at: new Date().toISOString() })
            .eq("id", bizRunId);
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

      // ---- Read snapshots (single fetch)
      const earliest = baselineStartStr;

      const { data: rows, error: snapErr } = await supabase
        .from("snapshots")
        .select("snapshot_date,metrics")
        .eq("business_id", biz.id)
        .eq("source_id", stripeSource.id)
        .gte("snapshot_date", earliest)
        .lte("snapshot_date", currentEndStr);

      if (snapErr) throw new Error(`read_snapshots: ${snapErr.message}`);

      const all = rows ?? [];

      const baselineRows = all.filter(
        (r: any) => r.snapshot_date >= baselineStartStr && r.snapshot_date <= baselineEndStr
      );
      const priorRows = all.filter((r: any) => r.snapshot_date >= priorStartStr && r.snapshot_date <= priorEndStr);
      const currentRows = all.filter((r: any) => r.snapshot_date >= currentStartStr && r.snapshot_date <= currentEndStr);

      // ---- SUMS
      const baselineGross60d = sumMetric(baselineRows, "revenue_cents");
      const baselineRefunds60d = sumMetric(baselineRows, "refunds_cents");
      const baselineNet60dRaw = baselineGross60d - baselineRefunds60d;

      const currentGross14d = sumMetric(currentRows, "revenue_cents");
      const currentRefunds14d = sumMetric(currentRows, "refunds_cents");
      const currentNet14d = currentGross14d - currentRefunds14d;

      const priorGross14d = sumMetric(priorRows, "revenue_cents");
      const priorRefunds14d = sumMetric(priorRows, "refunds_cents");
      const priorNet14d = priorGross14d - priorRefunds14d;

      // ---- BASELINE NORMALIZATION
      const baselineHasHistory = baselineGross60d > 0;

      // If baseline is empty, fabricate a baseline net so revenue delta isn't nonsense
      const effectiveBaselineNet60d = baselineHasHistory
        ? baselineNet60dRaw
        : Math.round(currentNet14d * (60 / 14));

      // Convert baseline 60d -> comparable 14d baseline
      const baselineNet14d = Math.round((effectiveBaselineNet60d / 60) * 14);

      // Refund rates
      const computedBaselineRefundRate = baselineGross60d > 0 ? baselineRefunds60d / baselineGross60d : 0;
      const currentRefundRate = currentGross14d > 0 ? currentRefunds14d / currentGross14d : 0;
      const baselineRefundRate = baselineHasHistory ? computedBaselineRefundRate : currentRefundRate;

      // ---- DRIFT
      const drift = computeDrift({
        baselineNetRevenueCents14d: baselineNet14d,
        currentNetRevenueCents14d: currentNet14d,
        priorNetRevenueCents14d: priorNet14d,
        baselineRefundRate,
        currentRefundRate,
      });

      let driftOut = { ...drift };

if (!baselineHasHistory) {
  driftOut = {
    ...drift,
    status: "stable",
    meta: {
      ...drift.meta,
      direction: "flat",
      mriScore: 100,
      mriRaw: 100,
      components: {
        revenue: 0,
        refunds: 0,
      },
    },
    reasons: [
      {
        code: "BASELINE_WARMUP",
        detail:
          "Building baseline — comparisons strengthen after ~2–4 weeks of data.",
      },
    ],
  };
}

      // Determine last status (from businesses.last_drift)
      const lastStatus = ((biz as any)?.last_drift?.status ?? null) as DriftStatus | null;
      const statusChanged = lastStatus !== (driftOut.status as DriftStatus);

      // ---- Persist: businesses.last_drift + optional alerts
      let alertInserted = false;

      if (!dryRun) {
        await supabase
          .from("businesses")
          .update({
            last_drift: driftOut,
            last_drift_at: new Date().toISOString(),
          })
          .eq("id", biz.id);

        // Insert alert only if status changed (or always, if you want)
        if (statusChanged) {
          const { error: aErr } = await supabase.from("alerts").insert({
            business_id: biz.id,
            status: driftOut.status,
            reasons: driftOut.reasons ?? [],
            window_start: currentStartStr,
            window_end: currentEndStr,
            meta: driftOut.meta ?? null,
          });
          if (!aErr) alertInserted = true;
        }

        // finish job run
        if (bizRunId) {
          await supabase
            .from("job_runs")
            .update({ status: "success", finished_at: new Date().toISOString() })
            .eq("id", bizRunId);
        }
      }

      // ---- Email (paid only unless force_email=true)
      let emailAttempted = false;
      let emailError: string | null = null;
      let emailId: string | null = null;

      const isPaid = Boolean((biz as any).is_paid);

      if (biz.alert_email && (forceEmail || isPaid) && (statusChanged || forceEmail)) {
        try {
          emailAttempted = true;

          const emailStatus = normalizeStatusForEmail(driftOut.status as DriftStatus);

          const reasonsText =
  (driftOut.reasons ?? [])
    .slice(0, 5)
    .map((r: any) => `• ${r.detail ?? r.code}`)
    .join("\n") || "• No issues detected";

const subject =
  emailStatus === "stable"
    ? `DRIFT: ${biz.name} is Stable`
    : emailStatus === "softening"
      ? `DRIFT: ${biz.name} is Softening`
      : `DRIFT: ${biz.name} needs Attention`;

const text =
  `Business: ${biz.name}\n` +
  `Status: ${String(emailStatus).toUpperCase()}\n` +
  `Window: ${currentStartStr} → ${currentEndStr}\n\n` +
  `Signals:\n${reasonsText}\n\n` +
  `— DRIFT`;

          if (!dryRun) {
            const res = await sendDriftEmail({
              to: biz.alert_email,
              subject,
              text,
            });
            emailId = (res as any)?.id ?? null;
          }
        } catch (e: any) {
          emailError = e?.message ?? String(e);
        }
      }

      const out: any = {
        business_id: biz.id,
        name: biz.name,
        drift: driftOut,
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
        email_debug: null,
      };

      if (debug) {
        out.debug = {
          windows: {
            baseline: { start: baselineStartStr, end: baselineEndStr, days: 60 },
            prior: { start: priorStartStr, end: priorEndStr, days: 14 },
            current: { start: currentStartStr, end: currentEndStr, days: 14 },
          },
          counts: {
            baselineRows: baselineRows.length,
            priorRows: priorRows.length,
            currentRows: currentRows.length,
          },
          sums: {
            baselineGross60d,
            baselineRefunds60d,
            baselineNet60d: baselineNet60dRaw,
            baselineNet14d,
            currentGross14d,
            currentRefunds14d,
            currentNet14d,
            priorNet14d,
          },
          rates: {
            baselineHasHistory,
            computedBaselineRefundRate,
            baselineRefundRate,
            currentRefundRate,
          },
        };
      }

      results.push(out);
    } catch (e: any) {
      const msg = e?.message ?? String(e);

      if (!dryRun && bizRunId) {
        await supabase
          .from("job_runs")
          .update({ status: "error", finished_at: new Date().toISOString(), error: msg })
          .eq("id", bizRunId);
      }

      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: "exception",
        error: msg,
        dry_run: dryRun,
      });
    }
  }

  return json(true, {
    dry_run: dryRun,
    businesses_processed: businesses?.length ?? 0,
    duration_ms: Date.now() - t0,
    filters: {
      ...(filterBusinessId ? { business_id: filterBusinessId } : {}),
      ...(filterSourceId ? { source_id: filterSourceId } : {}),
    },
    results,
  });
}