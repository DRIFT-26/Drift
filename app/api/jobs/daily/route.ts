import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift } from "@/lib/drift/compute";
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
type CronAuthResult =
  | { ok: true; debug: Record<string, any> }
  | { ok: false; error: "CRON_SECRET missing" | "Unauthorized"; debug: Record<string, any> };

function requireCronAuth(req: Request): CronAuthResult {
  const secret = (process.env.CRON_SECRET || "").trim();

  const authHeader = (req.headers.get("authorization") || "").trim();
  const match = authHeader.match(/^bearer\s+(.+)$/i);
  const bearerToken = (match?.[1] || "").trim();

  const xToken = (req.headers.get("x-cron-secret") || "").trim();
  const token = bearerToken || xToken;

  const debug = {
    hasCronSecretEnv: Boolean(secret),
    authHeaderRaw: authHeader.slice(0, 60),
    bearerParsedPrefix: bearerToken ? bearerToken.slice(0, 10) : null,
    hasXCronSecretHeader: Boolean(xToken),
    xCronSecretPrefix: xToken ? xToken.slice(0, 10) : null,
    matched: Boolean(secret) && token === secret,
  };

  if (!secret) return { ok: false, error: "CRON_SECRET missing", debug };
  if (token !== secret) return { ok: false, error: "Unauthorized", debug };

  return { ok: true, debug };
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const debugMode = url.searchParams.get("debug") === "1";

  const auth = requireCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, ...(debugMode ? { debug: auth.debug } : {}) },
      { status: 401 }
    );
  }

  const supabase = supabaseAdmin();

  const dryRun = url.searchParams.get("dry_run") === "true";
  const forceEmail = url.searchParams.get("force_email") === "true";

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

  // Load businesses (NOTE: include monthly_revenue because computeDrift uses it)
  const { data: businesses, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,timezone,alert_email,is_paid,monthly_revenue");

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
    // Per-business run log
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
      // Load baseline config (fallback to 60/14)
      const { data: cfg } = await supabase
        .from("baseline_config")
        .select("*")
        .eq("business_id", biz.id)
        .maybeSingle();

      const baselineDays = cfg?.baseline_days ?? 60;
      const currentDays = cfg?.current_days ?? 14;

      const today = new Date();
      const baselineStart = new Date(today);
      baselineStart.setDate(today.getDate() - baselineDays);

      const currentStart = new Date(today);
      currentStart.setDate(today.getDate() - currentDays);

      const baselineStartStr = isoDate(baselineStart);
      const currentStartStr = isoDate(currentStart);
      const windowEndStr = isoDate(today);

      // Find connected sources
      const { data: sources, error: sErr } = await supabase
        .from("sources")
        .select("id,type,is_connected")
        .eq("business_id", biz.id);

      if (sErr) throw new Error(`read_sources: ${sErr.message}`);

      const connected = (sources ?? []).filter((s: any) => s.is_connected);

      const reviewsSource = connected.find(
        (s: any) => s.type === "csv_reviews" || s.type === "google_reviews"
      );
      const engagementSource = connected.find(
        (s: any) => s.type === "csv_engagement" || s.type === "klaviyo"
      );

      if (!reviewsSource && !engagementSource) {
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

      // Pull snapshots for baseline + current windows
      const { data: baselineRows, error: baseErr } = await supabase
        .from("snapshots")
        .select("source_id,metrics,snapshot_date")
        .eq("business_id", biz.id)
        .gte("snapshot_date", baselineStartStr);

      if (baseErr) throw new Error(`read_baseline_snapshots: ${baseErr.message}`);

      const { data: currentRows, error: curErr } = await supabase
        .from("snapshots")
        .select("source_id,metrics,snapshot_date")
        .eq("business_id", biz.id)
        .gte("snapshot_date", currentStartStr);

      if (curErr) throw new Error(`read_current_snapshots: ${curErr.message}`);

      const sum = (rows: any[], key: string) =>
        rows.reduce((acc, r) => acc + (r.metrics?.[key] ?? 0), 0);

      const avg = (rows: any[], key: string) => {
        const vals = rows
          .map((r) => r.metrics?.[key])
          .filter((v: any) => typeof v === "number");
        if (!vals.length) return 0;
        return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
      };

      const baselineReviews = reviewsSource
        ? (baselineRows ?? []).filter((r: any) => r.source_id === reviewsSource.id)
        : [];
      const currentReviews = reviewsSource
        ? (currentRows ?? []).filter((r: any) => r.source_id === reviewsSource.id)
        : [];

      const baselineEngRows = engagementSource
        ? (baselineRows ?? []).filter((r: any) => r.source_id === engagementSource.id)
        : [];
      const currentEngRows = engagementSource
        ? (currentRows ?? []).filter((r: any) => r.source_id === engagementSource.id)
        : [];

      // Reviews metrics
      const baselineReviewTotal = sum(baselineReviews, "review_count");
      const currentReviewTotal = sum(currentReviews, "review_count");
      const baselineReviewPerWindow =
        baselineDays > 0 ? (baselineReviewTotal / baselineDays) * currentDays : 0;

      const baselineSent = avg(baselineReviews, "sentiment_avg");
      const currentSent = avg(currentReviews, "sentiment_avg");

      // Engagement metrics
      const baselineEngAvg = avg(baselineEngRows, "engagement");
      const currentEngAvg = avg(currentEngRows, "engagement");

      // Compute drift (+ monthly revenue)
      const drift = computeDrift({
        baselineReviewCountPer14d: baselineReviewPerWindow,
        currentReviewCount14d: currentReviewTotal,
        baselineSentimentAvg: baselineSent,
        currentSentimentAvg: currentSent,
        baselineEngagement: baselineEngAvg,
        currentEngagement: currentEngAvg,
        monthlyRevenue: (biz as any).monthly_revenue ?? null,
      });

      // Write-through last_drift (freshest state even if no new alert inserted)
      if (!dryRun) {
        await supabase
          .from("businesses")
          .update({
            last_drift: drift as any,
            last_drift_at: new Date().toISOString(),
          })
          .eq("id", biz.id);
      }

      // Check last alert for status change
      const { data: lastAlert } = await supabase
        .from("alerts")
        .select("id,status,created_at")
        .eq("business_id", biz.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const statusChanged = !lastAlert || lastAlert.status !== drift.status;

      // Insert alert ONLY if status changed
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
          status: drift.status,
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