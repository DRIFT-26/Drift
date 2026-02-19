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

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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
    error: ok ? null : secret ? "Unauthorized" : "CRON_SECRET missing",
    debug: {
      hasCronSecretEnv: Boolean(secret),
      hasAuthorizationHeader: Boolean(authHeader),
      authorizationPrefix: authHeader ? authHeader.slice(0, 20) : null,
      bearerTokenPrefix: bearerToken ? bearerToken.slice(0, 10) : null,
      hasXCronSecretHeader: Boolean(xToken),
      xCronSecretPrefix: xToken ? xToken.slice(0, 10) : null,
      matched: ok,
    },
  };
}

function sum(rows: any[], key: string) {
  return rows.reduce((acc, r) => acc + (Number(r.metrics?.[key]) || 0), 0);
}

/**
 * Refund rate should be computed as:
 *   total_refunds / total_revenue
 * (NOT average of daily refund_rate; that can skew results.)
 */
function refundRateFrom(rows: any[]) {
  const revenue = sum(rows, "revenue_cents");
  const refunds = sum(rows, "refunds_cents");
  if (!revenue) return 0;
  return refunds / revenue;
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

  // Businesses
  let bq = supabase
    .from("businesses")
    .select("id,name,timezone,alert_email,is_paid,monthly_revenue_cents");

  if (filterBusinessId) bq = bq.eq("id", filterBusinessId);

  const { data: businesses, error: bErr } = await bq;

  if (bErr) {
    await supabase
      .from("job_runs")
      .update({
        status: "error",
        error: bErr.message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobRun.id);

    return NextResponse.json(
      { ok: false, step: "read_businesses", error: bErr.message },
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
      // Baseline config (fallback 60/14)
      const { data: cfg } = await supabase
        .from("baseline_config")
        .select("*")
        .eq("business_id", biz.id)
        .maybeSingle();

      const baselineDays = cfg?.baseline_days ?? 60;
      const currentDays = cfg?.current_days ?? 14;

      const today = new Date();
      const windowEndStr = isoDate(today);

      const baselineStart = addDays(today, -baselineDays);
      const currentStart = addDays(today, -currentDays);

      // Prior window is the 14 days immediately BEFORE current window
      const priorStart = addDays(currentStart, -currentDays);
      const priorEnd = addDays(currentStart, -1);

      const baselineStartStr = isoDate(baselineStart);
      const currentStartStr = isoDate(currentStart);
      const priorStartStr = isoDate(priorStart);
      const priorEndStr = isoDate(priorEnd);

      // Sources
      const { data: sources, error: sErr } = await supabase
        .from("sources")
        .select("id,type,is_connected")
        .eq("business_id", biz.id);

      if (sErr) throw new Error(`read_sources: ${sErr.message}`);

      const connected = (sources ?? []).filter((s: any) => s.is_connected);

      const stripeSource = connected.find((s: any) => s.type === "stripe_revenue");

      if (!stripeSource) {
        // No Stripe: mark as skipped for Revenue v1
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

      // Pull snapshots for baseline+current+prior (single fetch to keep it fast)
      const earliest = priorStartStr < baselineStartStr ? priorStartStr : baselineStartStr;

      const { data: rows, error: snapErr } = await supabase
        .from("snapshots")
        .select("source_id,metrics,snapshot_date")
        .eq("business_id", biz.id)
        .eq("source_id", stripeSource.id)
        .gte("snapshot_date", earliest);

      if (snapErr) throw new Error(`read_snapshots: ${snapErr.message}`);

      const all = rows ?? [];

      const baselineRows = all.filter((r: any) => r.snapshot_date >= baselineStartStr);
      const currentRows = all.filter((r: any) => r.snapshot_date >= currentStartStr);
      const priorRows = all.filter(
        (r: any) => r.snapshot_date >= priorStartStr && r.snapshot_date <= priorEndStr
      );

      const baselineNetRevenue60d = sum(baselineRows, "net_revenue_cents");
      const currentNetRevenue14d = sum(currentRows, "net_revenue_cents");
      const priorNetRevenue14d = priorRows.length ? sum(priorRows, "net_revenue_cents") : null;

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

      const lastStatus = (lastAlert?.status ?? null) as DriftStatus | null;
      const statusChanged = !lastAlert || lastStatus !== drift.status;

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
            meta: drift.meta ?? null,
          })
          .select()
          .single();

        if (aErr) throw new Error(`insert_alert: ${aErr.message}`);
        insertedAlert = newAlert;
      }

      // Email gate
      const toEmail = biz.alert_email ?? null;
      const isPaid = (biz as any).is_paid === true;

      if (!dryRun && isPaid && toEmail && (statusChanged || forceEmail)) {
        emailAttempted = true;

        const { subject, text } = renderStatusEmail({
          businessName: biz.name ?? biz.id,
          status: drift.status as any,
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
              engine: drift.meta?.engine ?? null,
              drift_status: drift.status,
              reasons: drift.reasons,
              window_start: currentStartStr,
              window_end: windowEndStr,
              force_email: forceEmail,
              status_changed: statusChanged,
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
        last_status: lastStatus,
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
    businesses_processed: (businesses ?? []).length,
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    results,
  });
}