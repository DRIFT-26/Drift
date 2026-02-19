// app/api/jobs/daily/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift, type DriftStatus } from "@/lib/drift/compute";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Auth for:
 * - Vercel Cron: Authorization: Bearer <CRON_SECRET>
 * - Manual testing: x-cron-secret: <CRON_SECRET>
 *
 * Use ?debug=1 to see safe auth diagnostics on 401.
 */
function requireCronAuth(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();

  const authHeader = (req.headers.get("authorization") || "").trim();
  const m = authHeader.match(/^bearer\s+(.+)$/i);
  const bearerToken = (m?.[1] || "").trim();

  const xToken = (req.headers.get("x-cron-secret") || "").trim();

  const token = bearerToken || xToken;
  const ok = Boolean(secret) && token === secret;

  return {
    ok,
    error: !secret ? "CRON_SECRET missing" : "Unauthorized",
    debug: {
      hasCronSecretEnv: Boolean(secret),
      hasAuthorizationHeader: Boolean(authHeader),
      authorizationPrefix: authHeader ? authHeader.slice(0, 20) : null,
      hasXCronSecretHeader: Boolean(xToken),
      xCronSecretPrefix: xToken ? xToken.slice(0, 10) : null,
      matched: ok,
    },
  };
}

function safeNum(v: any): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function sumMetric(rows: any[], key: string): number {
  return (rows ?? []).reduce((acc, r) => acc + safeNum(r?.metrics?.[key]), 0);
}

function refundRateFrom(rows: any[]): number {
  const gross = sumMetric(rows, "revenue_cents");
  if (gross <= 0) return 0;
  const refunds = sumMetric(rows, "refunds_cents");
  return Math.max(0, Math.min(1, refunds / gross));
}

function clampEmailStatus(s: DriftStatus | null | undefined): "stable" | "softening" | "attention" {
  // Email template only supports these three.
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  // Map anything else (watch/drift/etc) to softening to avoid type/runtime breaks.
  return "stable";
}

async function loadBusinessesWithMonthlyRevenue(supabase: ReturnType<typeof supabaseAdmin>, filterBusinessId: string | null) {
  // Production schema drifted historically: some envs had monthly_revenue, others monthly_revenue_cents.
  // This makes the job resilient by retrying without the missing column.
  let q = supabase.from("businesses").select("id,name,timezone,alert_email,is_paid,monthly_revenue_cents");
  if (filterBusinessId) q = q.eq("id", filterBusinessId);

  const first = await q;
  if (!first.error) return { data: first.data ?? [], monthlyField: "monthly_revenue_cents" as const };

  const msg = first.error.message || "";
  if (!msg.includes("does not exist")) {
    throw new Error(`read_businesses: ${msg}`);
  }

  let q2 = supabase.from("businesses").select("id,name,timezone,alert_email,is_paid,monthly_revenue");
  if (filterBusinessId) q2 = q2.eq("id", filterBusinessId);

  const second = await q2;
  if (second.error) throw new Error(`read_businesses: ${second.error.message}`);

  return { data: second.data ?? [], monthlyField: "monthly_revenue" as const };
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const auth = requireCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, ...(debug ? { debug: auth.debug } : {}) },
      { status: 401 }
    );
  }

  const supabase = supabaseAdmin();

  const dryRun = url.searchParams.get("dry_run") === "true";
  const forceEmail = url.searchParams.get("force_email") === "true";

  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");

  // Job-level run log
  const { data: jobRun, error: jobRunErr } = await supabase
    .from("job_runs")
    .insert({ job_name: "daily", status: "started" })
    .select()
    .single();

  if (jobRunErr) {
    return NextResponse.json(
      { ok: false, step: "job_runs_start", error: jobRunErr.message },
      { status: 500 }
    );
  }

  const startedAt = new Date();

  // Load businesses (schema-resilient re: monthly_revenue*)
  let businesses: any[] = [];
  let monthlyField: "monthly_revenue_cents" | "monthly_revenue" = "monthly_revenue_cents";
  try {
    const loaded = await loadBusinessesWithMonthlyRevenue(supabase, filterBusinessId);
    businesses = loaded.data;
    monthlyField = loaded.monthlyField;
  } catch (e: any) {
    await supabase
      .from("job_runs")
      .update({
        status: "error",
        error: e?.message ?? String(e),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobRun.id);

    return NextResponse.json(
      { ok: false, step: "read_businesses", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }

  const results: any[] = [];

  for (const biz of businesses ?? []) {
    const { data: bizRun } = await supabase
      .from("job_runs")
      .insert({ job_name: "daily:business", business_id: biz.id, status: "started" })
      .select()
      .single();

    let emailAttempted = false;
    let emailError: string | null = null;
    let emailId: string | null = null;
    let emailDebug: any = null;

    try {
      // Baseline config (defaults)
      const { data: cfg } = await supabase
        .from("baseline_config")
        .select("*")
        .eq("business_id", biz.id)
        .maybeSingle();

      const baselineDays = cfg?.baseline_days ?? 60;
      const currentDays = cfg?.current_days ?? 14;

      const today = new Date();
      const windowEndStr = isoDate(today);

      const currentStart = new Date(today);
      currentStart.setDate(today.getDate() - currentDays + 1); // inclusive window of N days
      const currentStartStr = isoDate(currentStart);

      const baselineStart = new Date(today);
      baselineStart.setDate(today.getDate() - baselineDays + 1);
      const baselineStartStr = isoDate(baselineStart);

      // Prior window: the N days immediately before current window
      const priorEnd = new Date(currentStart);
      priorEnd.setDate(currentStart.getDate() - 1);
      const priorEndStr = isoDate(priorEnd);

      const priorStart = new Date(priorEnd);
      priorStart.setDate(priorEnd.getDate() - currentDays + 1);
      const priorStartStr = isoDate(priorStart);

      // Find connected sources (Revenue v1 = stripe_revenue only)
      let sQ = supabase
        .from("sources")
        .select("id,type,is_connected")
        .eq("business_id", biz.id);

      if (filterSourceId) sQ = sQ.eq("id", filterSourceId);

      const { data: sources, error: sErr } = await sQ;
      if (sErr) throw new Error(`read_sources: ${sErr.message}`);

      const connected = (sources ?? []).filter((s: any) => s.is_connected);

      const stripeSource = connected.find((s: any) => s.type === "stripe_revenue");

      if (!stripeSource) {
        await supabase
          .from("job_runs")
          .update({ status: "success", finished_at: new Date().toISOString() })
          .eq("id", bizRun?.id);

        results.push({
          business_id: biz.id,
          name: biz.name,
          skipped: true,
          reason: filterSourceId ? "source_not_stripe_revenue_or_not_connected" : "no_stripe_revenue_source",
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

      // Pull snapshots for baseline+current+prior in one query
      const earliest = [baselineStartStr, priorStartStr].sort()[0];

      const { data: rows, error: snapErr } = await supabase
        .from("snapshots")
        .select("metrics,snapshot_date")
        .eq("business_id", biz.id)
        .eq("source_id", stripeSource.id)
        .gte("snapshot_date", earliest)
        .lte("snapshot_date", windowEndStr);

      if (snapErr) throw new Error(`read_snapshots: ${snapErr.message}`);

      const all = rows ?? [];

      // Strict window bounds
      const inRange = (d: string, start: string, end: string) => d >= start && d <= end;

      const baselineRows = all.filter((r: any) => inRange(r.snapshot_date, baselineStartStr, windowEndStr));
      const currentRows = all.filter((r: any) => inRange(r.snapshot_date, currentStartStr, windowEndStr));
      const priorRows = all.filter((r: any) => inRange(r.snapshot_date, priorStartStr, priorEndStr));

      // Revenue + refunds
      const baselineNetRevenue60d = sumMetric(baselineRows, "net_revenue_cents");
      const currentNetRevenue14d = sumMetric(currentRows, "net_revenue_cents");
      const priorNetRevenue14d = priorRows.length ? sumMetric(priorRows, "net_revenue_cents") : null;

      const baselineRefundRate = refundRateFrom(baselineRows);
      const currentRefundRate = refundRateFrom(currentRows);

      const drift = computeDrift({
        baselineNetRevenue60d,
        currentNetRevenue14d,
        priorNetRevenue14d,
        baselineRefundRate,
        currentRefundRate,
      });

      // Write-through last_drift for UI freshness
      if (!dryRun) {
        await supabase
          .from("businesses")
          .update({
            last_drift: drift as any,
            last_drift_at: new Date().toISOString(),
          })
          .eq("id", biz.id);
      }

      // Last alert for status change
      const { data: lastAlert } = await supabase
        .from("alerts")
        .select("id,status,created_at")
        .eq("business_id", biz.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const statusChanged = !lastAlert || lastAlert.status !== drift.status;

      // Insert alert only if status changed
      let insertedAlert: any = null;
      if (!dryRun && statusChanged) {
        const { data: newAlert, error: aErr } = await supabase
          .from("alerts")
          .insert({
            business_id: biz.id,
            status: drift.status,
            reasons: drift.reasons,
            window_start: currentStartStr,
            window_end: windowEndStr,
            meta: (drift as any).meta ?? null,
          })
          .select()
          .single();

        if (aErr) throw new Error(`insert_alert: ${aErr.message}`);
        insertedAlert = newAlert;
      }

      // Email send gate
      const toEmail = biz.alert_email ?? null;
      const isPaid = (biz as any).is_paid === true;

      // Monthly revenue: accept either cents or dollars column (we store cents in RiskImpact)
      const monthlyRaw = (biz as any)?.[monthlyField] ?? null;
      const monthlyRevenueCents =
        monthlyField === "monthly_revenue_cents"
          ? (typeof monthlyRaw === "number" ? monthlyRaw : safeNum(monthlyRaw))
          : Math.round(safeNum(monthlyRaw) * 100);

      if (!dryRun && isPaid && toEmail && (statusChanged || forceEmail)) {
        emailAttempted = true;

        const emailStatus = clampEmailStatus(drift.status);

        const { subject, text } = renderStatusEmail({
          businessName: biz.name ?? biz.id,
          status: emailStatus,
          reasons: drift.reasons,
          windowStart: currentStartStr,
          windowEnd: windowEndStr,
        });

        try {
          const sendResult = await sendDriftEmail({ to: toEmail, subject, text });

          emailId = (sendResult as any)?.data?.id ?? (sendResult as any)?.id ?? null;
          emailDebug = {
            keys: Object.keys(sendResult as any),
            data: (sendResult as any)?.data ?? null,
            error: (sendResult as any)?.error ?? null,
          };

          await supabase.from("email_logs").insert({
            business_id: biz.id,
            email_type: "daily_alert",
            to_email: toEmail,
            subject,
            status: (sendResult as any)?.error ? "error" : "sent",
            provider: "resend",
            provider_message_id: emailId,
            error: (sendResult as any)?.error ? JSON.stringify((sendResult as any)?.error) : null,
            meta: {
              engine: (drift as any)?.meta?.engine ?? null,
              direction: (drift as any)?.meta?.direction ?? null,
              drift_status: drift.status,
              reasons: drift.reasons,
              window_start: currentStartStr,
              window_end: windowEndStr,
              force_email: forceEmail,
              status_changed: statusChanged,
              monthly_revenue_cents: monthlyRevenueCents,
            },
          });
        } catch (e: any) {
          emailError = e?.message ?? String(e);
        }
      }

      await supabase
        .from("job_runs")
        .update({ status: "success", finished_at: new Date().toISOString() })
        .eq("id", bizRun?.id);

      results.push({
        business_id: biz.id,
        name: biz.name,
        drift,
        last_status: lastAlert?.status ?? null,
        status_changed: statusChanged,
        alert_inserted: Boolean(insertedAlert),
        dry_run: dryRun,
        force_email: forceEmail,
        email_to: toEmail,
        is_paid: (biz as any).is_paid ?? null,
        email_attempted: emailAttempted,
        email_error: emailError,
        email_id: emailId,
        email_debug: emailDebug,
      });
    } catch (e: any) {
      await supabase
        .from("job_runs")
        .update({
          status: "error",
          error: e?.message ?? String(e),
          finished_at: new Date().toISOString(),
        })
        .eq("id", bizRun?.id);

      results.push({
        business_id: biz.id,
        name: biz.name,
        ok: false,
        error: e?.message ?? String(e),
        dry_run: dryRun,
        force_email: forceEmail,
        email_to: biz.alert_email ?? null,
        is_paid: (biz as any).is_paid ?? null,
        email_attempted: false,
        email_error: e?.message ?? String(e),
        email_id: null,
        email_debug: null,
      });
    }
  }

  const finishedAt = new Date();
  await supabase
    .from("job_runs")
    .update({ status: "success", finished_at: finishedAt.toISOString() })
    .eq("id", jobRun.id);

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    filters: {
      business_id: filterBusinessId ?? null,
      source_id: filterSourceId ?? null,
    },
    businesses_processed: (businesses ?? []).length,
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    results,
  });
}