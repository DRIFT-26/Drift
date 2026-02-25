// app/api/jobs/weekly/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import { shouldRunWeeklyNow } from "@/lib/dispatch";
import { renderWeeklyPulseEmail } from "@/lib/email/templates";

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

function normalizeStatus(raw: any): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
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

function pickTopStatus(statuses: DriftStatus[]) {
  if (statuses.includes("attention")) return "attention";
  if (statuses.includes("softening")) return "softening";
  if (statuses.includes("watch")) return "watch";
  return "stable";
}

async function alreadySentRecently(params: {
  supabase: ReturnType<typeof supabaseAdmin>;
  ownerEmail: string;
  now: Date;
}) {
  const { supabase, ownerEmail, now } = params;
  const since = new Date(now);
  since.setHours(now.getHours() - 20);

  const { data } = await supabase
    .from("email_logs")
    .select("id")
    .eq("email_type", "weekly_pulse")
    .eq("to_email", ownerEmail)
    .gte("created_at", since.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}

function buildWeeklyPulseText(args: {
  windowStart: string;
  windowEnd: string;
  businesses: Array<{ id: string; name: string; last_drift: any | null }>;
}) {
  const statuses = args.businesses.map((b) => normalizeStatus(b.last_drift?.status));
  const counts = statusCounts(statuses);
  const top = pickTopStatus(statuses);

  const header =
    top === "attention"
      ? `Needs attention 🔴`
      : top === "softening"
      ? `Softening 🟠`
      : top === "watch"
      ? `Watch 🟡`
      : `All clear ✅`;

  const ranked = [...args.businesses].sort((a, b) => {
    const rank = (s: DriftStatus) =>
      s === "attention" ? 3 : s === "softening" ? 2 : s === "watch" ? 1 : 0;
    return rank(normalizeStatus(b.last_drift?.status)) - rank(normalizeStatus(a.last_drift?.status));
  });

  const topItems = ranked
    .filter((b) => normalizeStatus(b.last_drift?.status) !== "stable")
    .slice(0, 3)
    .map((b) => {
      const s = normalizeStatus(b.last_drift?.status);
      const reason = b.last_drift?.reasons?.[0]?.detail ?? "Signal detected";
      return `- ${b.name} — ${s.toUpperCase()} — ${reason}\n  ${baseUrl()}/alerts/${b.id}`;
    });

  return `
DRIFT Weekly Pulse — ${header}

Week: ${args.windowStart} → ${args.windowEnd}
Portfolio: ${args.businesses.length} business(es)
Status mix: ${counts.attention} Attention · ${counts.softening} Softening · ${counts.watch} Watch · ${counts.stable} Stable

${topItems.length ? `Top items:\n${topItems.join("\n")}` : "Top items: None this week."}

Open DRIFT: ${baseUrl()}/alerts

—
Short. Specific. Actionable.
`.trim();
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const auth = requireCronAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const supabase = supabaseAdmin();
  const dispatch = url.searchParams.get("dispatch") === "1";
  const dryRun = url.searchParams.get("dry_run") === "true";
  const forceSend = url.searchParams.get("force_send") === "true";

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id,name,timezone,is_paid,alert_email,last_drift,created_at")
    .order("created_at", { ascending: true });

  const byEmail = new Map<string, any[]>();

  for (const biz of businesses ?? []) {
    const isPaid = biz.is_paid === true;
    if (!isPaid && !forceSend) continue;

    if (dispatch && !shouldRunWeeklyNow(biz.timezone)) continue;

    const email = String(biz.alert_email || "").trim().toLowerCase();
    if (!email) continue;

    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email)!.push(biz);
  }

  const results: any[] = [];
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - 7);

  for (const [ownerEmail, bizList] of byEmail.entries()) {
  if (dispatch) {
    const sentRecently = await alreadySentRecently({ supabase, ownerEmail, now });
    if (sentRecently) {
      results.push({ owner_email: ownerEmail, skipped: true, reason: "already_sent_recently" });
      continue;
    }
  }

  const { subject, text } = renderWeeklyPulseEmail({
    windowStart: isoDate(windowStart),
    windowEnd: isoDate(now),
    businesses: bizList.map((b: any) => ({
      id: b.id,
      name: b.name,
      last_drift: b.last_drift ?? null,
    })),
  });

  if (dryRun) {
    results.push({ owner_email: ownerEmail, skipped: true, reason: "dry_run" });
    continue;
  }

  const sendResult = await sendDriftEmail({ to: ownerEmail, subject, text });
  const emailId = (sendResult as any)?.data?.id ?? (sendResult as any)?.id ?? null;

  await supabase.from("email_logs").insert({
    business_id: null,
    email_type: "weekly_pulse",
    to_email: ownerEmail,
    subject,
    status: (sendResult as any)?.error ? "error" : "sent",
    provider: "resend",
    provider_message_id: emailId,
    meta: {
      kind: "weekly_pulse",
      dispatch,
      force_send: forceSend,
      window_start: isoDate(windowStart),
      window_end: isoDate(now),
      businesses: bizList.map((b: any) => ({ id: b.id, name: b.name })),
    },
  });

  results.push({ owner_email: ownerEmail, sent: true, email_id: emailId });
}

  return NextResponse.json({
    ok: true,
    dispatch,
    dry_run: dryRun,
    results,
  });
}