// app/api/jobs/daily/route.ts
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

function sumMetric(rows: any[], key: string) {
  return rows.reduce((acc, r) => acc + (Number(r.metrics?.[key] ?? 0) || 0), 0);
}

function avgMetric(rows: any[], key: string) {
  const vals = rows
    .map((r) => r.metrics?.[key])
    .filter((v: any) => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) return 0;
  return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
}

function refundRateFromSums(refundsCents: number, revenueCents: number) {
  if (!revenueCents || revenueCents <= 0) return 0;
  return Math.max(0, Math.min(1, refundsCents / revenueCents));
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

  let bizQuery = supabase
    .from("businesses")
    .select("id,name,timezone,alert_email,is_paid,monthly_revenue_cents");

  if (filterBusinessId) bizQuery = bizQuery.eq("id", filterBusinessId);

  const { data: businesses, error: bErr } = await bizQuery;

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
      // Load baseline config (fallback)
      const { data: cfg } = await supabase
        .from("baseline_config")
        .select("*")
        .eq("business_id", biz.id)
        .maybeSingle();

      const baselineDays = cfg?.baseline_days ?? 60;
      const currentDays = cfg?.current_days ?? 14;

      const today = new Date();
      const baselineStart = addDays(today, -baselineDays);
      const currentStart = addDays(today, -currentDays);
      const prevStart = addDays(today, -(currentDays * 2)); // prior 14d window start

      const baselineStartStr = isoDate(baselineStart);
      const currentStartStr = isoDate(currentStart);
      const prevStartStr = isoDate(prevStart);
      const windowEndStr = isoDate(today);

      // Find connected sources
      const { data: sources, error: sErr } = await supabase
        .from("sources")
        .select("id,type,is_connected")
        .eq("business_id", biz.id);

      if (sErr) throw new Error(`read_sources: ${sErr.message}`);

      const connected = (sources ?? []).filter((s: any) => s.is_connected);

      const stripeSource = connected.find((s: any) => s.type === "stripe_revenue");
      const reviewsSource = connected.find((s: any) => s.type === "csv_reviews" || s.type === "google_reviews");
      const engagementSource = connected.find((s: any) => s.type === "csv_engagement" || s.type === "klaviyo");

      if (!stripeSource && !reviewsSource && !engagementSource) {
        await supabase
          .from("job_runs")
          .update({ status: "success", finished_at: new Date().toISOString() })
          .eq("id", bizRun?.id);

        results.push({
          business_id: biz.id,
          name: biz.name,
          skipped: true,
          reason: "no_connected_sources",
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

      // Pull snapshots:
      // - baseline (>= baselineStart)
      // - current+prev (>= prevStart) so we can compute momentum delta
      const { data: baselineRows, error: baseErr } = await supabase
        .from("snapshots")
        .select("source_id,metrics,snapshot_date")
        .eq("business_id", biz.id)
        .gte("snapshot_date", baselineStartStr);

      if (baseErr) throw new Error(`read_baseline_snapshots: ${baseErr.message}`);

      const { data: recentRows, error: recErr } = await supabase
        .from("snapshots")
        .select("source_id,metrics,snapshot_date")
        .eq("business_id", biz.id)
        .gte("snapshot_date", prevStartStr);

      if (recErr) throw new Error(`read_recent_snapshots: ${recErr.message}`);

      let drift: any = null;

      // ===== Stripe Revenue Momentum v1 (preferred) =====
      if (stripeSource) {
        const baselineStripe = (baselineRows ?? []).filter((r: any) => r.source_id === stripeSource.id);
        const recentStripe = (recentRows ?? []).filter((r: any) => r.source_id === stripeSource.id);

        const currentStripe = recentStripe.filter((r: any) => r.snapshot_date >= currentStartStr);
        const prevStripe = recentStripe.filter(
          (r: any) => r.snapshot_date >= prevStartStr && r.snapshot_date < currentStartStr
        );

        const baselineNet = sumMetric(baselineStripe, "net_revenue_cents");
        const currentNet = sumMetric(currentStripe, "net_revenue_cents");
        const prevNet = sumMetric(prevStripe, "net_revenue_cents");

        const baselineRefunds = sumMetric(baselineStripe, "refunds_cents");
        const baselineRevenue = sumMetric(baselineStripe, "revenue_cents");

        const currentRefunds = sumMetric(currentStripe, "refunds_cents");
        const currentRevenue = sumMetric(currentStripe, "revenue_cents");

        const baselineRefundRate = refundRateFromSums(baselineRefunds, baselineRevenue);
        const currentRefundRate = refundRateFromSums(currentRefunds, currentRevenue);

        const currentCharges = sumMetric(currentStripe, "charge_count");
        const prevCharges = sumMetric(prevStripe, "charge_count");
        const baselineCharges = sumMetric(baselineStripe, "charge_count");

        let drift;

const stripeSource = connected.find((s: any) => s.type === "stripe_revenue");

const sumMetric = (rows: any[], key: string) =>
  rows.reduce((acc, r) => acc + (Number(r.metrics?.[key]) || 0), 0);

const sortByDate = (rows: any[]) =>
  [...rows].sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));

if (stripeSource) {
  const baselineStripe = (baselineRows ?? []).filter(
    (r: any) => r.source_id === stripeSource.id
  );
  const currentStripe = (currentRows ?? []).filter(
    (r: any) => r.source_id === stripeSource.id
  );

  const baseNet = sumMetric(baselineStripe, "net_revenue_cents");
  const curNet = sumMetric(currentStripe, "net_revenue_cents");
  const baseRefunds = sumMetric(baselineStripe, "refunds_cents");
  const curRefunds = sumMetric(currentStripe, "refunds_cents");

  const ordered = sortByDate(currentStripe);
  const first7 = ordered.slice(0, 7);
  const last7 = ordered.slice(-7);

  const prev7Net = sumMetric(first7, "net_revenue_cents");
  const last7Net = sumMetric(last7, "net_revenue_cents");

  drift = computeDrift({
    baselineNetRevenueCents: baseNet,
    currentNetRevenueCents: curNet,
    baselineRefundsCents: baseRefunds,
    currentRefundsCents: curRefunds,
    currentNetRevenuePrev7Cents: prev7Net,
    currentNetRevenueLast7Cents: last7Net,
    baselineDays,
    currentDays,
  });
} else {
  drift = computeDrift({
    baselineReviewCountPer14d: baselineReviewPerWindow,
    currentReviewCount14d: currentReviewTotal,
    baselineSentimentAvg: baselineSent,
    currentSentimentAvg: currentSent,
    baselineEngagement: baselineEngAvg,
    currentEngagement: currentEngAvg,
  });
}

        // Make the driver explicit for debugging/telemetry
        drift.meta = { ...(drift.meta ?? {}), engine: "stripe_revenue" };
      } else {
        // ===== Legacy Reputation/Engagement engine (fallback) =====
        // Keep your existing behavior so other test businesses don't break.
        const baselineReviews = reviewsSource
          ? (baselineRows ?? []).filter((r: any) => r.source_id === reviewsSource.id)
          : [];
        const currentReviews = reviewsSource
          ? (recentRows ?? []).filter((r: any) => r.source_id === reviewsSource.id && r.snapshot_date >= currentStartStr)
          : [];

        const baselineEngRows = engagementSource
          ? (baselineRows ?? []).filter((r: any) => r.source_id === engagementSource.id)
          : [];
        const currentEngRows = engagementSource
          ? (recentRows ?? []).filter((r: any) => r.source_id === engagementSource.id && r.snapshot_date >= currentStartStr)
          : [];

        const baselineReviewTotal = sumMetric(baselineReviews, "review_count");
        const currentReviewTotal = sumMetric(currentReviews, "review_count");
        const baselineReviewPerWindow = baselineDays > 0 ? (baselineReviewTotal / baselineDays) * currentDays : 0;

        const baselineSent = avgMetric(baselineReviews, "sentiment_avg");
        const currentSent = avgMetric(currentReviews, "sentiment_avg");

        const baselineEngAvg = avgMetric(baselineEngRows, "engagement");
        const currentEngAvg = avgMetric(currentEngRows, "engagement");

        // This is legacy — you can delete later once Stripe is universal.
        // For now, keep your old compute behavior by mapping into revenue-style input (neutral).
        drift = {
          status: "attention",
          reasons: [
            { code: "LEGACY_ENGINE", detail: "Using legacy engine (no Stripe connected)" },
          ],
          meta: {
            engine: "legacy",
            reviewDrop: baselineReviewPerWindow > 0 ? 1 : 0,
            engagementDrop: baselineEngAvg > 0 ? 1 : 0,
            sentimentDelta: currentSent - baselineSent,
            mriScore: null,
            mriRaw: null,
            components: null,
          },
        };
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

        const { subject, text } = renderStatusEmail({
          businessName: biz.name ?? biz.id,
          status: drift.status, // must be stable|softening|attention
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