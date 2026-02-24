// app/api/jobs/weekly/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import {
  executiveSummary,
  normalizeStatus,
  statusForEmail,
  type DriftStatus,
} from "@/lib/executive/summary";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
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
  };
}

function rankStatus(s: DriftStatus) {
  if (s === "attention") return 3;
  if (s === "softening") return 2;
  if (s === "watch") return 1;
  return 0;
}

function makeWeeklyEmailText(args: {
  ownerEmail: string;
  windowStart: string;
  windowEnd: string;
  baseUrl: string;
  businesses: Array<{
    id: string;
    name: string;
    status: DriftStatus;
    headline: string;
    confidence: string;
    nextSteps: string[];
    detailsPath: string;
  }>;
}) {
  const { windowStart, windowEnd, baseUrl, businesses } = args;

  const attention = businesses.filter((b) => b.status === "attention");
  const softening = businesses.filter((b) => b.status === "softening" || b.status === "watch");
  const stable = businesses.filter((b) => b.status === "stable");

  const lines: string[] = [];

  lines.push(`DRIFT Weekly Executive Digest`);
  lines.push(`${windowStart} → ${windowEnd}`);
  lines.push(``);
  lines.push(`Portfolio summary:`);
  lines.push(`- Attention: ${attention.length}`);
  lines.push(`- Watch/Softening: ${softening.length}`);
  lines.push(`- Stable: ${stable.length}`);
  lines.push(``);

  const focus = [...attention, ...softening].sort((a, b) => rankStatus(b.status) - rankStatus(a.status));

  if (focus.length === 0) {
    lines.push(`All clear. No material risk signals detected across your portfolio.`);
    lines.push(``);
  } else {
    lines.push(`Priority items:`);
    for (const b of focus.slice(0, 8)) {
      const url = `${baseUrl}${b.detailsPath}`;
      lines.push(``);
      lines.push(`• ${b.name} — ${b.status.toUpperCase()} (confidence: ${b.confidence})`);
      lines.push(`  ${b.headline}`);
      const steps = (b.nextSteps ?? []).slice(0, 2);
      if (steps.length) {
        lines.push(`  Next steps:`);
        for (const s of steps) lines.push(`   - ${s}`);
      }
      lines.push(`  View details: ${url}`);
    }
    lines.push(``);
  }

  // Optional: include stable list at the bottom (CEO-safe: keep it short)
  if (stable.length) {
    lines.push(`Stable: ${stable.slice(0, 10).map((s) => s.name).join(", ")}${stable.length > 10 ? "…" : ""}`);
    lines.push(``);
  }

  lines.push(`—`);
  lines.push(`DRIFT runs quietly in the background and only reaches out when something materially changes.`);
  return lines.join("\n");
}

export async function POST(req: Request) {
  const url = new URL(req.url);

  const dryRun = url.searchParams.get("dry_run") === "true";
  const dispatch = url.searchParams.get("dispatch") === "1";
  const businessId = (url.searchParams.get("business_id") || "").trim();
  const forceEmail = url.searchParams.get("force_email") === "true";

  const auth = requireCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const startedAt = Date.now();

  // Weekly window is 7 days
  const today = new Date();
  const windowEndStr = isoDate(today);
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - 7);
  const windowStartStr = isoDate(windowStart);

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://drift-app-indol.vercel.app").replace(/\/$/, "");

  const { data: businesses, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,timezone,is_paid,alert_email,monthly_revenue_cents,monthly_revenue,last_drift")
    .order("created_at", { ascending: true });

  if (bErr) {
    return NextResponse.json({ ok: false, step: "read_businesses", error: bErr.message }, { status: 500 });
  }

// Group by owner email (CEO-grade portfolio)
const byEmail = new Map<string, any[]>();

for (const biz of businesses ?? []) {
  if (businessId && biz.id !== businessId) continue;

  const isPaid = (biz as any).is_paid === true;

  // Mirror daily: paid-only unless force_email=true (beta/testing)
  if (!isPaid && !forceEmail) continue;

  const email = String((biz as any).alert_email || "")
    .trim()
    .toLowerCase();

  if (!email) continue;

  if (!byEmail.has(email)) byEmail.set(email, []);
  byEmail.get(email)!.push(biz);
}

  const results: any[] = [];

  // Dispatch mode for weekly: only run Monday around 08:30 local
  // (We keep this “good enough” and safe.)
  function shouldRunWeeklyNow(tz: string | null | undefined) {
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

      if (weekday !== "Mon") return false;

      const total = hour * 60 + minute;
      // 08:25–08:35 local
      return total >= 8 * 60 + 25 && total <= 8 * 60 + 35;
    } catch {
      return false;
    }
  }

  for (const [email, bizList] of byEmail.entries()) {
    // If dispatch=1, only send if at least one biz’s timezone says it’s time
    if (dispatch) {
      const anyOk = bizList.some((b) => shouldRunWeeklyNow((b as any).timezone));
      if (!anyOk) {
        results.push({ owner_email: email, skipped: true, reason: "dispatch_window" });
        continue;
      }
    }

    const execBiz = bizList.map((biz) => {
      const lastDrift = (biz as any).last_drift ?? null;
      const status: DriftStatus = normalizeStatus(lastDrift?.status);
      const reasons = Array.isArray(lastDrift?.reasons) ? lastDrift.reasons : [];
      const meta = lastDrift?.meta ?? {};

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

      return {
        id: biz.id,
        name: biz.name,
        status,
        confidence: exec.confidence,
        headline: exec.headline,
        nextSteps: exec.nextSteps,
        detailsPath: exec.detailsPath,
      };
    });

    const subject = `DRIFT Weekly Executive Digest — ${execBiz.filter((b) => b.status === "attention").length} attention, ${execBiz.filter((b) => b.status !== "stable").length} total in review`;

    const text = makeWeeklyEmailText({
      ownerEmail: email,
      windowStart: windowStartStr,
      windowEnd: windowEndStr,
      baseUrl,
      businesses: execBiz.sort((a, b) => rankStatus(b.status) - rankStatus(a.status)),
    });

    if (dryRun) {
      results.push({
        owner_email: email,
        dry_run: true,
        businesses: execBiz.length,
        subject,
      });
      continue;
    }

    try {
      const sendResult = await sendDriftEmail({
        to: email,
        subject,
        text,
      });

      const emailId = (sendResult as any)?.data?.id ?? (sendResult as any)?.id ?? null;
      const sendErr = (sendResult as any)?.error ?? null;

      // Log one row per owner email; attach portfolio snapshot
      await supabase.from("email_logs").insert({
        business_id: execBiz[0]?.id ?? null, // best-effort; portfolio email isn’t one biz
        email_type: "weekly_digest",
        to_email: email,
        subject,
        status: sendErr ? "error" : "sent",
        provider: "resend",
        provider_message_id: emailId,
        error: sendErr ? JSON.stringify(sendErr) : null,
        meta: {
          kind: "weekly_portfolio_exec",
          window_start: windowStartStr,
          window_end: windowEndStr,
          portfolio: execBiz.map((b) => ({
            id: b.id,
            name: b.name,
            status: statusForEmail(b.status),
            headline: b.headline,
            confidence: b.confidence,
          })),
        },
      });

      results.push({
        owner_email: email,
        sent: !sendErr,
        email_id: emailId,
        businesses: execBiz.length,
      });
    } catch (e: any) {
      results.push({ owner_email: email, sent: false, error: e?.message ?? String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    dispatch,
    dry_run: dryRun,
    duration_ms: Date.now() - startedAt,
    window: { start: windowStartStr, end: windowEndStr, days: 7 },
    results,
  });
}