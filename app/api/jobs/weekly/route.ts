// app/api/jobs/weekly/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";

export const runtime = "nodejs";

type DriftStatus = "stable" | "watch" | "softening" | "attention";

function baseUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = (process.env.VERCEL_URL || "").trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://drift-app-indol.vercel.app";
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Auth for:
 * - GitHub Actions / Vercel Cron: Authorization: Bearer <CRON_SECRET>
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

function normalizeStatus(raw: any): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
  return "stable";
}

function formatStatus(s: DriftStatus) {
  return s.toUpperCase();
}

function pickTopStatus(statuses: DriftStatus[]) {
  // Highest severity first
  if (statuses.includes("attention")) return "attention";
  if (statuses.includes("softening")) return "softening";
  if (statuses.includes("watch")) return "watch";
  return "stable";
}

function statusCounts(statuses: DriftStatus[]) {
  return {
    attention: statuses.filter((s) => s === "attention").length,
    softening: statuses.filter((s) => s === "softening").length,
    watch: statuses.filter((s) => s === "watch").length,
    stable: statuses.filter((s) => s === "stable").length,
  };
}

/**
 * Returns { weekday, hour, minute } in the business timezone using Intl.
 * weekday: 1=Mon ... 7=Sun
 */
function localTimeParts(timeZone: string, now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "00";

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    weekday: weekdayMap[weekdayStr] ?? 1,
    hour: Number(hourStr),
    minute: Number(minuteStr),
  };
}

/**
 * B+ default: Monday 7:15am LOCAL.
 * GitHub Actions runs every 15 minutes, so minute should be ~15.
 *
 * We allow a small window to be resilient (07:10 - 07:20).
 */
function isWeeklyDispatchWindow(timeZone: string, now = new Date()) {
  const t = localTimeParts(timeZone, now);
  const isMonday = t.weekday === 1;
  const is715Hour = t.hour === 7;
  const inMinuteWindow = t.minute >= 10 && t.minute <= 20;
  return isMonday && is715Hour && inMinuteWindow;
}

/**
 * Prevent accidental duplicates:
 * - If we've sent a weekly pulse to this owner in the last ~20 hours, skip.
 */
async function alreadySentRecently(params: {
  supabase: ReturnType<typeof supabaseAdmin>;
  ownerEmail: string;
  now: Date;
}) {
  const { supabase, ownerEmail, now } = params;
  const since = new Date(now);
  since.setHours(now.getHours() - 20);

  const { data, error } = await supabase
    .from("email_logs")
    .select("id,created_at")
    .eq("email_type", "weekly_pulse")
    .eq("to_email", ownerEmail)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return false; // fail-open (don’t block sending)
  return (data?.length ?? 0) > 0;
}

function buildWeeklyPulseText(args: {
  ownerEmail: string;
  windowStart: string;
  windowEnd: string;
  businesses: Array<{
    id: string;
    name: string;
    timezone: string | null;
    last_drift: any | null;
  }>;
}) {
  const statuses = args.businesses.map((b) => normalizeStatus(b.last_drift?.status));
  const counts = statusCounts(statuses);
  const top = pickTopStatus(statuses);

  const topLine =
    top === "attention"
      ? `Needs attention 🔴 (${counts.attention} issue${counts.attention === 1 ? "" : "s"})`
      : top === "softening"
      ? `Softening 🟠 (${counts.softening} item${counts.softening === 1 ? "" : "s"})`
      : top === "watch"
      ? `Watch 🟡 (${counts.watch} item${counts.watch === 1 ? "" : "s"})`
      : "All clear ✅ (0 issues)";

  // Top 3 items, highest severity first
  const ranked = [...args.businesses].sort((a, b) => {
    const sa = normalizeStatus(a.last_drift?.status);
    const sb = normalizeStatus(b.last_drift?.status);
    const rank = (s: DriftStatus) =>
      s === "attention" ? 3 : s === "softening" ? 2 : s === "watch" ? 1 : 0;
    return rank(sb) - rank(sa);
  });

  const topItems = ranked
    .filter((b) => {
      const s = normalizeStatus(b.last_drift?.status);
      return s !== "stable";
    })
    .slice(0, 3)
    .map((b) => {
      const s = normalizeStatus(b.last_drift?.status);
      const reasons = Array.isArray(b.last_drift?.reasons) ? b.last_drift.reasons : [];
      const reason = reasons?.[0]?.detail || reasons?.[0]?.code || "Signal detected";
      const url = `${baseUrl()}/alerts/${b.id}`;
      return `- ${b.name} — ${formatStatus(s)} — ${reason}\n  ${url}`;
    });

  const portfolioUrl = `${baseUrl()}/alerts`;

  const executivePrompt =
    top === "attention"
      ? "Executive prompt: What decision do we make in the next 24–48 hours?"
      : top === "softening"
      ? "Executive prompt: What’s the fastest intervention to stop the slide?"
      : top === "watch"
      ? "Executive prompt: Do we understand why this is trending?"
      : "Executive prompt: What are we missing? Scan the Watch list.";

  const lines = [
    `DRIFT Weekly Pulse — ${topLine}`,
    ``,
    `Week: ${args.windowStart} → ${args.windowEnd}`,
    `Portfolio: ${args.businesses.length} business${args.businesses.length === 1 ? "" : "es"} monitored`,
    `Status mix: ${counts.attention} Attention · ${counts.softening} Softening · ${counts.watch} Watch · ${counts.stable} Stable`,
    ``,
    executivePrompt,
    ``,
    topItems.length ? `Top items:` : `Top items: None this week.`,
    topItems.length ? topItems.join("\n") : ``,
    ``,
    `Open DRIFT: ${portfolioUrl}`,
    ``,
    `—`,
    `This message is designed to be CEO-readable: short, specific, actionable.`,
  ];

  return lines.join("\n").trim() + "\n";
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

  const dispatch = url.searchParams.get("dispatch") === "1";
  const dryRun = url.searchParams.get("dry_run") === "true";
  const forceSend = url.searchParams.get("force_send") === "true";
  const businessId = (url.searchParams.get("business_id") || "").trim() || null;

  const startedAt = new Date();

  const { data: businesses, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,timezone,is_paid,alert_email,last_drift,created_at")
    .order("created_at", { ascending: true });

  if (bErr) {
    return NextResponse.json({ ok: false, step: "read_businesses", error: bErr.message }, { status: 500 });
  }

  // Group by owner email (portfolio pulse)
  const byEmail = new Map<
    string,
    Array<{ id: string; name: string; timezone: string | null; last_drift: any | null; is_paid: boolean }>
  >();

  for (const biz of businesses ?? []) {
    if (businessId && biz.id !== businessId) continue;

    const isPaid = (biz as any).is_paid === true;

    // Mirror daily: paid-only unless force_send=true (beta/testing)
    if (!isPaid && !forceSend) continue;

    const email = String((biz as any).alert_email || "").trim().toLowerCase();
    if (!email) continue;

    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email)!.push({
      id: biz.id,
      name: biz.name,
      timezone: (biz as any).timezone ?? null,
      last_drift: (biz as any).last_drift ?? null,
      is_paid: isPaid,
    });
  }

  const results: any[] = [];
  const now = new Date();

  // Weekly window: last 7 days (for display only)
  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - 7);

  const windowStartStr = isoDate(windowStart);
  const windowEndStr = isoDate(now);

  for (const [ownerEmail, bizList] of byEmail.entries()) {
    // Dispatch gate: Monday 7:15am LOCAL (using the first biz timezone as the portfolio timezone)
    if (dispatch) {
      const tz = bizList[0]?.timezone || "America/Chicago";
      if (!isWeeklyDispatchWindow(tz, now)) {
        results.push({ owner_email: ownerEmail, skipped: true, reason: "dispatch_window" });
        continue;
      }

      // Duplicate guard
      const sentRecently = await alreadySentRecently({ supabase, ownerEmail, now });
      if (sentRecently) {
        results.push({ owner_email: ownerEmail, skipped: true, reason: "already_sent_recently" });
        continue;
      }
    }

    const text = buildWeeklyPulseText({
      ownerEmail,
      windowStart: windowStartStr,
      windowEnd: windowEndStr,
      businesses: bizList,
    });

    // Subject based on highest status in portfolio
    const statuses = bizList.map((b) => normalizeStatus(b.last_drift?.status));
    const counts = statusCounts(statuses);
    const top = pickTopStatus(statuses);

    const subject =
      top === "attention"
        ? `DRIFT Weekly Pulse — ${counts.attention} needs attention 🔴`
        : top === "softening"
        ? `DRIFT Weekly Pulse — Softening detected 🟠`
        : top === "watch"
        ? `DRIFT Weekly Pulse — Watch list updated 🟡`
        : "DRIFT Weekly Pulse — All Clear ✅";

    if (dryRun) {
      results.push({ owner_email: ownerEmail, skipped: true, reason: "dry_run" });
      continue;
    }

    try {
      const sendResult = await sendDriftEmail({
        to: ownerEmail,
        subject,
        text,
      });

      const emailId = (sendResult as any)?.data?.id ?? (sendResult as any)?.id ?? null;

      // Log one row per owner pulse (not per business)
      await supabase.from("email_logs").insert({
        business_id: null,
        email_type: "weekly_pulse",
        to_email: ownerEmail,
        subject,
        status: (sendResult as any)?.error ? "error" : "sent",
        provider: "resend",
        provider_message_id: emailId,
        error: (sendResult as any)?.error ? JSON.stringify((sendResult as any)?.error) : null,
        meta: {
          kind: "weekly_pulse",
          dispatch,
          window_start: windowStartStr,
          window_end: windowEndStr,
          businesses: bizList.map((b) => ({ id: b.id, name: b.name })),
          counts,
          top_status: top,
          force_send: forceSend,
        },
      });

      results.push({
        owner_email: ownerEmail,
        sent: true,
        email_id: emailId,
        counts,
        top_status: top,
      });
    } catch (e: any) {
      // Best-effort failure log
      try {
        await supabase.from("email_logs").insert({
          business_id: null,
          email_type: "weekly_pulse",
          to_email: ownerEmail,
          subject,
          status: "error",
          provider: "resend",
          provider_message_id: null,
          error: e?.message ?? String(e),
          meta: {
            kind: "weekly_pulse",
            dispatch,
            window_start: windowStartStr,
            window_end: windowEndStr,
            businesses: bizList.map((b) => ({ id: b.id, name: b.name })),
            force_send: forceSend,
          },
        });
      } catch {
        // ignore logging errors
      }

      results.push({ owner_email: ownerEmail, sent: false, error: e?.message ?? String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    dispatch,
    dry_run: dryRun,
    window: { start: windowStartStr, end: windowEndStr, days: 7 },
    duration_ms: Date.now() - startedAt.getTime(),
    results,
  });
}