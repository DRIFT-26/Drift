// app/api/jobs/daily/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift, type DriftResult, type DriftStatus } from "@/lib/drift/compute";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

type JobResult = {
  business_id: string;
  name: string;
  skipped?: boolean;
  reason?: string;

  drift?: DriftResult | null;

  last_status: DriftStatus | null;
  status_changed: boolean;

  alert_inserted: boolean;

  dry_run: boolean;
  force_email: boolean;

  email_to: string | null;
  is_paid: boolean | null;
  email_attempted: boolean;
  email_error: string | null;
  email_id: string | null;
  email_debug: any;

  debug?: any;
};

function isoDate(d: Date) {
  // UTC YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, deltaDays: number) {
  const d = new Date(dateStr + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return isoDate(d);
}

function parseBool(v: string | null, defaultValue = false) {
  if (v === null || v === undefined) return defaultValue;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function authOk(req: Request) {
  const expected = process.env.CRON_SECRET || process.env.JOBS_SECRET || process.env.INTERNAL_CRON_SECRET;
  if (!expected) return true; // allow local/dev
  const h = req.headers;
  const bearer = h.get("authorization") || "";
  const token =
    bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : h.get("x-cron-secret")?.trim() || "";
  return token && token === expected;
}

const toNum = (v: any) => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
};

const sum = (rows: any[], key: string) => rows.reduce((acc, r) => acc + toNum(r?.metrics?.[key]), 0);

const netFrom = (rows: any[]) => sum(rows, "revenue_cents") - sum(rows, "refunds_cents");

const refundRateFrom = (rows: any[]) => {
  const rev = sum(rows, "revenue_cents");
  const ref = sum(rows, "refunds_cents");
  if (rev <= 0) return 0;
  return ref / rev;
};

export async function POST(req: Request) {
  if (!authOk(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const supabase = supabaseAdmin();

  const url = new URL(req.url);
  const dryRun = parseBool(url.searchParams.get("dry_run"), false);
  const debug = parseBool(url.searchParams.get("debug"), false);
  const forceEmail = parseBool(url.searchParams.get("force_email"), false);

  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");

  // Window config (Revenue v1)
  const BASELINE_DAYS = 60;
  const CURRENT_DAYS = 14;
  const PRIOR_DAYS = 14;

  const today = isoDate(new Date()); // UTC
  const currentEndStr = today;
  const currentStartStr = addDays(currentEndStr, -(CURRENT_DAYS - 1));

  const baselineEndStr = addDays(currentStartStr, -1);
  const baselineStartStr = addDays(baselineEndStr, -(BASELINE_DAYS - 1));

  const priorEndStr = addDays(currentStartStr, -1);
  const priorStartStr = addDays(priorEndStr, -(PRIOR_DAYS - 1));

  // Read businesses (ONLY columns we know exist)
  let bq = supabase.from("businesses").select("id,name,timezone,alert_email,is_paid,monthly_revenue");
  if (filterBusinessId) bq = bq.eq("id", filterBusinessId);

  const { data: businesses, error: bErr } = await bq;
  if (bErr) {
    return NextResponse.json({ ok: false, step: "read_businesses", error: bErr.message }, { status: 500 });
  }

  const results: JobResult[] = [];

  for (const biz of businesses ?? []) {
    // Create job run (best-effort; don't hard-fail if schema differs)
    let bizRun: { id: string } | null = null;
    try {
      const { data: jr } = await supabase
        .from("job_runs")
        .insert({ job_name: "daily:business", business_id: biz.id, status: "started" })
        .select("id")
        .single();
      if (jr?.id) bizRun = jr as any;
    } catch {
      // ignore
    }

    try {
      // Pull connected sources for the business
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
        // mark run success and continue
        if (bizRun?.id) {
          try {
            await supabase
              .from("job_runs")
              .update({ status: "success", finished_at: new Date().toISOString() })
              .eq("id", bizRun.id);
          } catch {
            // ignore
          }
        }

        results.push({
          business_id: biz.id,
          name: biz.name,
          skipped: true,
          reason: "no_stripe_revenue_source",
          drift: null,
          last_status: null,
          status_changed: false,
          alert_inserted: false,
          dry_run: dryRun,
          force_email: forceEmail,
          email_to: biz.alert_email ?? null,
          is_paid: (biz as any).is_paid ?? null,
          email_attempted: false,
          email_error: null,
          email_id: null,
          email_debug: null,
          ...(debug
            ? {
                debug: {
                  windows: {
                    baseline: { start: baselineStartStr, end: baselineEndStr, days: BASELINE_DAYS },
                    current: { start: currentStartStr, end: currentEndStr, days: CURRENT_DAYS },
                    prior: { start: priorStartStr, end: priorEndStr, days: PRIOR_DAYS },
                  },
                  note: "No stripe_revenue source connected.",
                },
              }
            : {}),
        });

        continue;
      }

      // Fetch snapshots once (from earliest window start)
      const earliest = baselineStartStr < priorStartStr ? baselineStartStr : priorStartStr;

      const { data: rows, error: snapErr } = await supabase
        .from("snapshots")
        .select("source_id,metrics,snapshot_date")
        .eq("business_id", biz.id)
        .eq("source_id", stripeSource.id)
        .gte("snapshot_date", earliest);

      if (snapErr) throw new Error(`read_snapshots: ${snapErr.message}`);

      const all = rows ?? [];

      // Inclusive ranges using ISO compare
      const baselineRows = all.filter(
        (r: any) => r.snapshot_date >= baselineStartStr && r.snapshot_date <= baselineEndStr
      );
      const currentRows = all.filter(
        (r: any) => r.snapshot_date >= currentStartStr && r.snapshot_date <= currentEndStr
      );
      const priorRows = all.filter((r: any) => r.snapshot_date >= priorStartStr && r.snapshot_date <= priorEndStr);

      // Compute net + refund rate
      const baselineNetRevenue60d = netFrom(baselineRows);
      const currentNetRevenue14d = netFrom(currentRows);
      const priorNetRevenue14d = priorRows.length ? netFrom(priorRows) : null;

      // Normalize 60d baseline to 14d equivalent (so apples-to-apples)
      const baselineNetRevenueCents14d =
        BASELINE_DAYS > 0 ? Math.round((baselineNetRevenue60d / BASELINE_DAYS) * CURRENT_DAYS) : 0;

      const baselineRefundRate = refundRateFrom(baselineRows);
      const currentRefundRate = refundRateFrom(currentRows);

      const drift = computeDrift({
        baselineNetRevenueCents14d,
        currentNetRevenue14d, 
        priorNetRevenue14d,
        baselineRefundRate,
        currentRefundRate,
      });

      // Read last drift/status for change detection (best-effort)
      let lastStatus: DriftStatus | null = null;
      try {
        const { data: last } = await supabase
          .from("businesses")
          .select("last_drift")
          .eq("id", biz.id)
          .single();
        lastStatus = (last as any)?.last_drift?.status ?? null;
      } catch {
        lastStatus = null;
      }

      const latestStatus = (drift?.status ?? null) as DriftStatus | null;
      const statusChanged = Boolean(latestStatus && latestStatus !== lastStatus);

      // Persist to business (unless dry_run)
      if (!dryRun) {
        await supabase
          .from("businesses")
          .update({
            last_drift: drift,
            last_drift_at: new Date().toISOString(),
          })
          .eq("id", biz.id);
      }

      // Insert alert when status changes AND it's not stable (unless dry_run)
      let alertInserted = false;
      if (!dryRun && statusChanged && latestStatus && latestStatus !== "stable") {
        const { error: aInsErr } = await supabase.from("alerts").insert({
          business_id: biz.id,
          status: latestStatus,
          reasons: drift.reasons ?? [],
          window_start: currentStartStr,
          window_end: currentEndStr,
          meta: drift.meta ?? null,
        });
        alertInserted = !aInsErr;
      }

      // Email (paid only)
      let emailAttempted = false;
      let emailError: string | null = null;
      let emailId: string | null = null;
      let emailDebug: any = null;

      const isPaid = (biz as any)?.is_paid ?? false;
      const to = (biz as any)?.alert_email ?? null;

      const shouldEmail = Boolean(isPaid && to && (forceEmail || statusChanged));

      if (shouldEmail) {
        emailAttempted = true;
        try {
          const { subject, text } = renderStatusEmail({
            businessName: biz.name,
            status: (drift.status ?? "stable") as any,
            reasons: drift.reasons ?? [],
            windowStart: currentStartStr,
            windowEnd: currentEndStr,
          });

          const r = await sendDriftEmail({ to, subject, text });
          emailId = (r as any)?.id ?? null;
          emailDebug = debug ? r : null;
        } catch (e: any) {
          emailError = e?.message ?? String(e);
        }
      }

      // Finish job run (best-effort)
      if (bizRun?.id) {
        try {
          await supabase
            .from("job_runs")
            .update({
              status: "success",
              finished_at: new Date().toISOString(),
            })
            .eq("id", bizRun.id);
        } catch {
          // ignore
        }
      }

      // Debug payload attached to this result (ONLY when debug=1)
      const debugPayload = debug
        ? {
            windows: {
              baseline: { start: baselineStartStr, end: baselineEndStr, days: BASELINE_DAYS },
              current: { start: currentStartStr, end: currentEndStr, days: CURRENT_DAYS },
              prior: { start: priorStartStr, end: priorEndStr, days: PRIOR_DAYS },
            },
            baseline: {
              rows: baselineRows.length,
              revenue_cents: sum(baselineRows, "revenue_cents"),
              refunds_cents: sum(baselineRows, "refunds_cents"),
              net_revenue_cents: netFrom(baselineRows),
              refund_rate: baselineRefundRate,
              baselineNetRevenueCents14d,
            },
            current: {
              rows: currentRows.length,
              revenue_cents: sum(currentRows, "revenue_cents"),
              refunds_cents: sum(currentRows, "refunds_cents"),
              net_revenue_cents: netFrom(currentRows),
              refund_rate: currentRefundRate,
              currentNetRevenue14d,
            },
            prior: {
              rows: priorRows.length,
              revenue_cents: sum(priorRows, "revenue_cents"),
              refunds_cents: sum(priorRows, "refunds_cents"),
              net_revenue_cents: netFrom(priorRows),
              refund_rate: refundRateFrom(priorRows),
              priorNetRevenue14d: priorNetRevenue14d,
            },
            source_id: stripeSource.id,
            business_id: biz.id,
          }
        : null;

      results.push({
        business_id: biz.id,
        name: biz.name,
        drift,
        last_status: lastStatus,
        status_changed: statusChanged,
        alert_inserted: alertInserted,
        dry_run: dryRun,
        force_email: forceEmail,
        email_to: to,
        is_paid: isPaid,
        email_attempted: emailAttempted,
        email_error: emailError,
        email_id: emailId,
        email_debug: emailDebug,
        ...(debugPayload ? { debug: debugPayload } : {}),
      });
    } catch (e: any) {
      // job run failure (best-effort)
      if (bizRun?.id) {
        try {
          await supabase
            .from("job_runs")
            .update({
              status: "error",
              finished_at: new Date().toISOString(),
              error: e?.message ?? String(e),
            })
            .eq("id", bizRun.id);
        } catch {
          // ignore
        }
      }

      results.push({
        business_id: biz.id,
        name: biz.name,
        drift: null,
        skipped: true,
        reason: e?.message ?? String(e),
        last_status: null,
        status_changed: false,
        alert_inserted: false,
        dry_run: dryRun,
        force_email: forceEmail,
        email_to: (biz as any)?.alert_email ?? null,
        is_paid: (biz as any)?.is_paid ?? null,
        email_attempted: false,
        email_error: null,
        email_id: null,
        email_debug: null,
        ...(debug
          ? {
              debug: {
                windows: {
                  baseline: { start: baselineStartStr, end: baselineEndStr, days: BASELINE_DAYS },
                  current: { start: currentStartStr, end: currentEndStr, days: CURRENT_DAYS },
                  prior: { start: priorStartStr, end: priorEndStr, days: PRIOR_DAYS },
                },
                error: e?.message ?? String(e),
              },
            }
          : {}),
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