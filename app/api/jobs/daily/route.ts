// app/api/jobs/daily/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import {
  renderStatusEmail,
  renderDailyMonitorEmail,
  renderTrialLifecycleEmail,
} from "@/lib/email/templates";
import { shouldRunDailyNow } from "@/lib/dispatch";
import {
  capReasons,
  executiveSummary,
  normalizeStatus,
  statusForEmail,
  type DriftStatus,
} from "@/lib/executive/summary";
import { businessHasAccess } from "@/lib/billing/access";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getDaysRemaining(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;

  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  const diff = end - now;

  if (diff <= 0) return 0;

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

async function lifecycleEmailAlreadySent(params: {
  supabase: ReturnType<typeof supabaseAdmin>;
  businessId: string;
  emailType: "trial_7_days" | "trial_3_days" | "trial_expired";
}) {
  const { supabase, businessId, emailType } = params;

  const { data } = await supabase
    .from("email_logs")
    .select("id")
    .eq("business_id", businessId)
    .eq("email_type", emailType)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

/**
 * Auth for:
 * - Vercel Cron: Authorization: Bearer <CRON_SECRET>
 * - Manual testing: x-cron-secret: <CRON_SECRET>
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
  };
}

function uniqueReasonCodes(reasons: any[]): string[] {
  const set = new Set<string>();
  for (const r of reasons ?? []) {
    const c = String(r?.code ?? "").trim();
    if (c) set.add(c);
  }
  return Array.from(set);
}

/**
 * Timezone-aware dispatch:
 * - default: run all businesses
 * - dispatch=1: only run businesses whose local time is around 08:15 and Mon–Fri
 */
function shouldRunNowForBiz(tz: string | null | undefined) {
  if (!tz) return false;

  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const weekday = get("weekday");
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));

    const isWeekday =
      weekday && ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
    if (!isWeekday) return false;

    // Run window: 08:10–08:20 local to allow a 15-min cron
    const total = hour * 60 + minute;
    return total >= 8 * 60 + 10 && total <= 8 * 60 + 20;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);

  const dryRun = url.searchParams.get("dry_run") === "true";
  const debug = url.searchParams.get("debug") === "1";
  const forceEmail = url.searchParams.get("force_email") === "true";
  const dispatch = url.searchParams.get("dispatch") === "1";
  const filterBusinessId = (url.searchParams.get("business_id") || "").trim();

  const auth = requireCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: 401 }
    );
  }

  const supabase = supabaseAdmin();
  const startedAt = Date.now();

  const { data: businesses, error: bErr } = await supabase
    .from("businesses")
    .select(
      "id,name,timezone,alert_email,monthly_revenue_cents,monthly_revenue,created_at,last_drift,last_drift_at,billing_status,trial_ends_at"
    )
    .order("created_at", { ascending: true });

  if (bErr) {
    return NextResponse.json(
      { ok: false, step: "read_businesses", error: bErr.message },
      { status: 500 }
    );
  }

  const today = new Date();
  const windowEndStr = isoDate(today);
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - 14);
  const windowStartStr = isoDate(windowStart);

  const results: any[] = [];

  for (const biz of businesses ?? []) {
    if (filterBusinessId && biz.id !== filterBusinessId) continue;

    if (dispatch && !shouldRunDailyNow((biz as any).timezone)) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: "dispatch_window",
      });
      continue;
    }

    if (!biz.alert_email) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: "no_alert_email",
      });
      continue;
    }

    const billingStatus = (biz as any).billing_status ?? null;
    const trialEndsAt = (biz as any).trial_ends_at ?? null;
    const daysRemaining = getDaysRemaining(trialEndsAt);

    const baseUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://drifthq.co"
    ).replace(/\/$/, "");
    const upgradeUrl = `${baseUrl}/upgrade?business_id=${encodeURIComponent(
      biz.id
    )}`;

    let lifecycleEmailType:
      | "trial_7_days"
      | "trial_3_days"
      | "trial_expired"
      | null = null;

    if (billingStatus === "trialing" && daysRemaining === 7) {
      lifecycleEmailType = "trial_7_days";
    } else if (billingStatus === "trialing" && daysRemaining === 3) {
      lifecycleEmailType = "trial_3_days";
    } else if (
      (billingStatus === "trialing" && daysRemaining === 0) ||
      billingStatus === "expired"
    ) {
      lifecycleEmailType = "trial_expired";
    }

    if (lifecycleEmailType) {
      const alreadySent = await lifecycleEmailAlreadySent({
        supabase,
        businessId: biz.id,
        emailType: lifecycleEmailType,
      });

      if (!alreadySent && !dryRun) {
        const { subject, text } = renderTrialLifecycleEmail({
          businessName: biz.name,
          daysRemaining:
            lifecycleEmailType === "trial_expired" ? 0 : daysRemaining ?? 0,
          upgradeUrl,
        });

        const sendResult = await sendDriftEmail({
          to: biz.alert_email,
          subject,
          text,
        });

        const emailId =
          (sendResult as any)?.data?.id ?? (sendResult as any)?.id ?? null;
        const sendErr = (sendResult as any)?.error ?? null;

        await supabase.from("email_logs").insert({
          business_id: biz.id,
          email_type: lifecycleEmailType,
          to_email: biz.alert_email,
          subject,
          status: sendErr ? "error" : "sent",
          provider: "resend",
          provider_message_id: emailId,
          error: sendErr ? JSON.stringify(sendErr) : null,
          meta: {
            kind: "trial_lifecycle",
            billing_status: billingStatus,
            trial_ends_at: trialEndsAt,
            days_remaining: daysRemaining,
            upgrade_url: upgradeUrl,
          },
        });
      }

      if (billingStatus === "trialing" && daysRemaining === 0) {
        await supabase
          .from("businesses")
          .update({ billing_status: "expired" })
          .eq("id", biz.id);
      }
    }

    const hasAccess = businessHasAccess({
      billing_status: billingStatus,
      trial_ends_at: trialEndsAt,
    });

    // --- Beta allowlist ---
    const allowlistRaw = (process.env.BETA_ALLOWLIST_EMAILS || "").trim();
    const allowlist = allowlistRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const bizEmail = String((biz as any).alert_email || "")
      .trim()
      .toLowerCase();
    const isBetaAllowed = Boolean(bizEmail) && allowlist.includes(bizEmail);
    const accessMode = hasAccess
      ? "billing_access"
      : isBetaAllowed
      ? "beta_allowlist"
      : "no_access";

    if (!hasAccess && !isBetaAllowed) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: "no_access",
        access_mode: accessMode,
      });
      continue;
    }

    const lastDrift = (biz as any).last_drift ?? null;
    if (!lastDrift?.status) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: "no_last_drift",
      });
      continue;
    }

    const status: DriftStatus = normalizeStatus(lastDrift.status);
    const reasons = Array.isArray(lastDrift.reasons) ? lastDrift.reasons : [];
    const meta = lastDrift.meta ?? {};

    const prevStatus: DriftStatus | null = lastDrift?.meta?.prev_status
      ? normalizeStatus(lastDrift.meta.prev_status)
      : null;

    const prevCodes = Array.isArray(lastDrift?.meta?.prev_reason_codes)
      ? (lastDrift.meta.prev_reason_codes as any[]).map(String)
      : null;

    const currentCodes = uniqueReasonCodes(reasons);

    const statusChanged = prevStatus ? prevStatus !== status : true;
    const reasonsChanged = prevCodes
      ? currentCodes.join("|") !== prevCodes.map(String).join("|")
      : currentCodes.length > 0;

    const shouldEmail = forceEmail || statusChanged || reasonsChanged;

    if (!shouldEmail) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: "no_change",
      });
      continue;
    }

    const monthlyRevenueCents =
      typeof (biz as any).monthly_revenue_cents === "number"
        ? (biz as any).monthly_revenue_cents
        : typeof (biz as any).monthly_revenue === "number"
        ? Math.round((biz as any).monthly_revenue * 100)
        : null;

    const exec = executiveSummary({
      businessName: biz.name,
      businessId: biz.id,
      status,
      reasons,
      meta,
      monthlyRevenueCents,
    });

    const limitedReasons = capReasons(reasons, 3);
    const detailsUrl = `${baseUrl}${exec.detailsPath}`;

    let subject = "";
    let finalText = "";
    let emailType = "daily_monitor";

    // Daily monitor for quiet states
    if (
      status === "stable" ||
      status === "watch" ||
      status === "movement"
    ) {
      const daily = renderDailyMonitorEmail({
        businessName: biz.name,
        status,
      });

      subject = daily.subject;
      finalText = daily.text;
      emailType = "daily_monitor";
    }

    // Stronger alert-style daily email for louder states
    if (status === "softening" || status === "attention") {
      const alert = renderStatusEmail({
        businessName: biz.name,
        status: statusForEmail(status),
        reasons: limitedReasons,
        windowStart: windowStartStr,
        windowEnd: windowEndStr,
        shareUrl: detailsUrl,
      });

      subject = alert.subject;
      finalText = alert.text;
      emailType = "daily_alert";
    }

    if (!subject || !finalText) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: "no_email_content",
        status,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        emailed: false,
        dry_run: true,
        status,
        subject,
        email_type: emailType,
        detailsUrl,
      });
      continue;
    }

    try {
      const sendResult = await sendDriftEmail({
        to: biz.alert_email,
        subject,
        text: finalText,
      });

      const emailId =
        (sendResult as any)?.data?.id ?? (sendResult as any)?.id ?? null;
      const sendErr = (sendResult as any)?.error ?? null;

      await supabase.from("email_logs").insert({
        business_id: biz.id,
        email_type: emailType,
        to_email: biz.alert_email,
        subject,
        status: sendErr ? "error" : "sent",
        provider: "resend",
        provider_message_id: emailId,
        error: sendErr ? JSON.stringify(sendErr) : null,
        meta: {
          kind: "daily_exec",
          window_start: windowStartStr,
          window_end: windowEndStr,
          exec: {
            status: exec.status,
            confidence: exec.confidence,
            headline: exec.headline,
            impact: exec.impact,
            drivers: exec.drivers?.slice(0, 2),
          },
          dedupe: {
            prev_status: prevStatus,
            status_changed: statusChanged,
            prev_reason_codes: prevCodes,
            current_reason_codes: currentCodes,
            reasons_changed: reasonsChanged,
            force_email: forceEmail,
          },
        },
      });

      await supabase
        .from("businesses")
        .update({
          last_drift: {
            ...lastDrift,
            meta: {
              ...(meta ?? {}),
              prev_status: status,
              prev_reason_codes: currentCodes,
            },
          },
        })
        .eq("id", biz.id);

      results.push({
        business_id: biz.id,
        name: biz.name,
        emailed: !sendErr,
        email_id: emailId,
        email_type: emailType,
        status,
        detailsUrl,
      });
    } catch (e: any) {
      if (debug) {
        results.push({
          business_id: biz.id,
          name: biz.name,
          emailed: false,
          error: e?.message ?? String(e),
        });
      } else {
        results.push({
          business_id: biz.id,
          name: biz.name,
          emailed: false,
          error: "send_failed",
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dispatch,
    dry_run: dryRun,
    duration_ms: Date.now() - startedAt,
    window: { start: windowStartStr, end: windowEndStr, days: 14 },
    results,
  });
}