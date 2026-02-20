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

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

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

// NOTE: templates.ts historically expects only: stable | softening | attention.
// If your DriftStatus includes "watch", map it safely for emails.
function toEmailStatus(status: DriftStatus): "stable" | "softening" | "attention" {
  if (status === "stable") return "stable";
  if (status === "attention") return "attention";
  // "watch" or "softening" -> "softening" in email templates
  return "softening";
}

const num = (v: any) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sumMetric = (arr: any[], key: string) =>
  arr.reduce((acc, r) => acc + num(r?.metrics?.[key]), 0);

const refundRateFrom = (arr: any[]) => {
  const gross = sumMetric(arr, "revenue_cents");
  const refunds = sumMetric(arr, "refunds_cents");
  if (gross <= 0) return 0;
  return refunds / gross;
};

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
    .insert({
      job_name: "daily",
      status: "started",
      meta: {
        dry_run: dryRun,
        force_email: forceEmail,
        filters: { business_id: filterBusinessId ?? null, source_id: filterSourceId ?? null },
      },
    })
    .select()
    .single();

  if (jobRunErr) {
    return NextResponse.json(
      { ok: false, step: "job_runs_start", error: jobRunErr.message },
      { status: 500 }
    );
  }

  const startedAt = new Date();

  // IMPORTANT:
  // Do NOT select columns that might not exist in Supabase.
  // Your prod DB has monthly_revenue (dollars), NOT monthly_revenue_cents.
  let bq = supabase
    .from("businesses")
    .select("id,name,timezone,alert_email,is_paid,monthly_revenue");

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
      .insert({
        job_name: "daily:business",
        business_id: biz.id,
        status: "started",
        meta: { dry_run: dryRun, force_email: forceEmail },
      })
      .select()
      .single();

    let emailAttempted = false;
    let emailError: string | null = null;
    let emailId: string | null = null;
    let emailDebug: any = null;

    try {
      // Load baseline config (fallback to 60/14)
      const { data: cfg } = await supabase
        .from("baseline_config")
        .select("*")
        .eq("business_id", biz.id)
        .maybeSingle();

      const baselineDays = cfg?.baseline_days ?? 60;
      const currentDays = cfg?.current_days ?? 14;

      const today = new Date();
      const windowEndStr = isoDate(today);

      const baselineStartStr = isoDate(addDays(today, -baselineDays));
      const currentStartStr = isoDate(addDays(today, -currentDays));

      // Prior window (immediately before current window)
      const priorEnd = addDays(today, -currentDays); // end is exclusive-ish; we’ll use date strings + <= in filter below
      const priorEndStr = isoDate(priorEnd);
      const priorStartStr = isoDate(addDays(priorEnd, -currentDays));

      // Find connected sources
      let sq = supabase
        .from("sources")
        .select("id,type,is_connected")
        .eq("business_id", biz.id);

      if (filterSourceId) sq = sq.eq("id", filterSourceId);

      const { data: sources, error: sErr } = await sq;

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
          reason: filterSourceId ? "no_stripe_revenue_source_for_source_id" : "no_stripe_revenue_source",
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

      // Pull snapshots for baseline+current+prior (single fetch)
      const earliest = priorStartStr < baselineStartStr ? priorStartStr : baselineStartStr;

      const { data: rows, error: snapErr } = await supabase
        .from("snapshots")
        .select("source_id,metrics,snapshot_date")
        .eq("business_id", biz.id)
        .eq("source_id", stripeSource.id)
        .gte("snapshot_date", earliest);

      if (snapErr) throw new Error(`read_snapshots: ${snapErr.message}`);

      const all = rows ?? [];

      // Windows
      const baselineRows = all.filter((r: any) => r.snapshot_date >= baselineStartStr);
      const currentRows = all.filter((r: any) => r.snapshot_date >= currentStartStr);
      const priorRows = all.filter(
        (r: any) => r.snapshot_date >= priorStartStr && r.snapshot_date <= priorEndStr
      );

      // Revenue
      const baselineNetRevenue60d = sumMetric(baselineRows, "net_revenue_cents");
      const currentNetRevenue14d = sumMetric(currentRows, "net_revenue_cents");
      const priorNetRevenue14d = priorRows.length ? sumMetric(priorRows, "net_revenue_cents") : null;

      // Refund rate
      const baselineRefundRate = refundRateFrom(baselineRows);
      const currentRefundRate = refundRateFrom(currentRows);

      // Compute Drift (Revenue v1 engine)
      const drift = computeDrift({
        baselineNetRevenue60d,
        currentNetRevenue14d,
        priorNetRevenue14d,
        baselineRefundRate,
        currentRefundRate,
      });

      if (debug) {
        // safe server logs only
        console.log("daily revenue_v1", {
          business_id: biz.id,
          source_id: stripeSource.id,
          baselineNetRevenue60d,
          currentNetRevenue14d,
          priorNetRevenue14d,
          baselineRefundRate,
          currentRefundRate,
          status: drift.status,
          direction: (drift as any)?.meta?.direction ?? null,
        });
      }

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

      if (!dryRun && isPaid && toEmail && (statusChanged || forceEmail)) {
        emailAttempted = true;

        const emailStatus = toEmailStatus(drift.status);

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
              drift_status: drift.status,
              drift_engine: (drift as any)?.meta?.engine ?? null,
              drift_direction: (drift as any)?.meta?.direction ?? null,
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
    .update({
      status: "success",
      finished_at: finishedAt.toISOString(),
    })
    .eq("id", jobRun.id);

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    businesses_processed: (businesses ?? []).length,
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    filters: {
      business_id: filterBusinessId ?? null,
      source_id: filterSourceId ?? null,
    },
    results,
  });
}