// app/api/jobs/daily/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";
import {
  capReasons,
  executiveSummary,
  normalizeStatus,
  statusForEmail,
  type DriftStatus,
} from "@/lib/executive/summary";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
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
 *
 * NOTE: We don’t need perfect timezone math for v1—just “good enough” behavior.
 * If timezone parsing fails, it will safely skip dispatch filtering.
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
    const weekday = get("weekday"); // Mon, Tue...
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));

    const isWeekday = weekday && ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
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
  const forceEmail = url.searchParams.get("force_email") === "true"; // doesn’t bypass paid gate
  const dispatch = url.searchParams.get("dispatch") === "1";

  const filterBusinessId = (url.searchParams.get("business_id") || "").trim();

  const auth = requireCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const startedAt = Date.now();

  const { data: businesses, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,timezone,is_paid,alert_email,monthly_revenue_cents,monthly_revenue,created_at,last_drift,last_drift_at")
    .order("created_at", { ascending: true });

  if (bErr) {
    return NextResponse.json({ ok: false, step: "read_businesses", error: bErr.message }, { status: 500 });
  }

  const today = new Date();
  const windowEndStr = isoDate(today);
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - 14);
  const windowStartStr = isoDate(windowStart);

  const results: any[] = [];

  for (const biz of businesses ?? []) {
    if (filterBusinessId && biz.id !== filterBusinessId) continue;

    if (dispatch && !shouldRunNowForBiz((biz as any).timezone)) {
      results.push({ business_id: biz.id, name: biz.name, skipped: true, reason: "dispatch_window" });
      continue;
    }

    const isPaid = (biz as any).is_paid === true;

// --- Beta allowlist (fastest path; no DB changes) ---
// Comma-separated emails in Vercel env: BETA_ALLOWLIST_EMAILS
// Example: "carlosjarrett27@gmail.com,ceo@company.com"
const allowlistRaw = (process.env.BETA_ALLOWLIST_EMAILS || "").trim();
const allowlist = allowlistRaw
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const bizEmail = String((biz as any).alert_email || "").trim().toLowerCase();
const isBetaAllowed = bizEmail && allowlist.includes(bizEmail);
const paidMode = isPaid ? "paid" : isBetaAllowed ? "beta_allowlist" : "unpaid";

// Paid-only for alerts unless explicitly beta-allowed
if (!isPaid && !isBetaAllowed) {
  results.push({
    business_id: biz.id,
    name: biz.name,
    skipped: true,
    reason: "not_paid",
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

    // Your compute job should already update businesses.last_drift via /api/jobs/daily compute.
    // If you want this route to *only* send emails based on last_drift, we read it here.
    const lastDrift = (biz as any).last_drift ?? null;
    if (!lastDrift?.status) {
      results.push({ business_id: biz.id, name: biz.name, skipped: true, reason: "no_last_drift" });
      continue;
    }

    const status: DriftStatus = normalizeStatus(lastDrift.status);
    const reasons = Array.isArray(lastDrift.reasons) ? lastDrift.reasons : [];
    const meta = lastDrift.meta ?? {};

    // CEO-grade dedupe:
    // Only email if status changed OR reason codes changed, unless force_email=1
    const prevStatus: DriftStatus | null = (lastDrift?.meta?.prev_status ? normalizeStatus(lastDrift.meta.prev_status) : null);

    const prevCodes = Array.isArray(lastDrift?.meta?.prev_reason_codes)
      ? (lastDrift.meta.prev_reason_codes as any[]).map(String)
      : null;

    const currentCodes = uniqueReasonCodes(reasons);

    const statusChanged = prevStatus ? prevStatus !== status : true; // first time => true
    const reasonsChanged =
      prevCodes ? currentCodes.join("|") !== prevCodes.map(String).join("|") : currentCodes.length > 0;

    const shouldEmail = forceEmail || statusChanged || reasonsChanged;

    if (!shouldEmail) {
      results.push({ business_id: biz.id, name: biz.name, skipped: true, reason: "no_change" });
      continue;
    }

    // Monthly revenue cents: accept cents field or dollars field
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

    const emailStatus = statusForEmail(status);
    const limitedReasons = capReasons(reasons, 3);

    const { subject, text } = renderStatusEmail({
      businessName: biz.name,
      status: emailStatus,
      reasons: limitedReasons,
      windowStart: windowStartStr,
      windowEnd: windowEndStr,
    });

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://drift-app-indol.vercel.app").replace(/\/$/, "");
    const detailsUrl = `${baseUrl}${exec.detailsPath}`;

    const finalText =
      `${exec.headline}\n` +
      (exec.impact.est_monthly ? `Estimated monthly impact: ${exec.impact.est_monthly}\n` : "") +
      (exec.drivers?.length ? `Key driver: ${exec.drivers[0].label} ${exec.drivers[0].value} (baseline ${exec.drivers[0].baseline})\n` : "") +
      `Confidence: ${exec.confidence}\n` +
      `\nNext steps:\n- ${exec.nextSteps.slice(0, 3).join("\n- ")}\n\n` +
      `View details: ${detailsUrl}\n\n` +
      `---\n` +
      text;

    if (dryRun) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        dry_run: true,
        would_email: true,
        status,
        email_to: biz.alert_email,
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

      const emailId = (sendResult as any)?.data?.id ?? (sendResult as any)?.id ?? null;
      const sendErr = (sendResult as any)?.error ?? null;

      await supabase.from("email_logs").insert({
        business_id: biz.id,
        email_type: "daily_alert",
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

      // Update prev markers to support next dedupe run
      // (store on last_drift.meta to avoid schema changes)
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
        results.push({ business_id: biz.id, name: biz.name, emailed: false, error: "send_failed" });
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