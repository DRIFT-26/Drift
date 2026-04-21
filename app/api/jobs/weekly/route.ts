import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import { shouldRunWeeklyNow } from "@/lib/dispatch";
import { renderWeeklyBriefingEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

type DriftStatus =
  | "stable"
  | "watch"
  | "softening"
  | "attention"
  | "movement";

function baseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://drifthq.co").replace(/\/$/, "");
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
  if (s === "movement") return "movement";
  return "stable";
}

function statusCounts(statuses: DriftStatus[]) {
  return {
    total: statuses.length,
    attention: statuses.filter((s) => s === "attention").length,
    softening: statuses.filter((s) => s === "softening").length,
    watch: statuses.filter((s) => s === "watch").length,
    movement: statuses.filter((s) => s === "movement").length,
    stable: statuses.filter((s) => s === "stable").length,
  };
}

function pickTopStatus(statuses: DriftStatus[]): DriftStatus {
  if (statuses.includes("attention")) return "attention";
  if (statuses.includes("softening")) return "softening";
  if (statuses.includes("watch")) return "watch";
  if (statuses.includes("movement")) return "movement";
  return "stable";
}

function buildWatchout(status: DriftStatus) {
  if (status === "attention") {
    return "Watch for any continued weakness early in the week. If conditions persist, immediate operator intervention may be needed.";
  }

  if (status === "softening") {
    return "Watch for consistency across the first half of the week. If performance stays below range, DRIFT will escalate it quickly.";
  }

  if (status === "watch") {
    return "Watch for whether this early movement carries into mid-week or settles back into normal range.";
  }

  if (status === "movement") {
    return "Watch whether this upside movement sustains into the week ahead or normalizes after the recent lift.";
  }

  return "Watch for any developing inconsistency across the week. If something begins to move, DRIFT will surface it early.";
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
    .eq("email_type", "weekly_briefing")
    .eq("to_email", ownerEmail)
    .gte("created_at", since.toISOString())
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const auth = requireCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: 401 }
    );
  }

  const supabase = supabaseAdmin();
  const dispatch = url.searchParams.get("dispatch") === "1";
  const dryRun = url.searchParams.get("dry_run") === "true";
  const forceSend = url.searchParams.get("force_send") === "true";

  const { data: businesses } = await supabase
    .from("businesses")
    .select(
      "id,name,timezone,alert_email,last_drift,created_at,billing_status,trial_ends_at"
    )
    .order("created_at", { ascending: true });

  const byEmail = new Map<string, any[]>();

  for (const biz of businesses ?? []) {
    const billingStatus = biz.billing_status;

    const hasAccess =
      billingStatus === "active" ||
      billingStatus === "internal" ||
      (billingStatus === "trialing" &&
        biz.trial_ends_at &&
        new Date(biz.trial_ends_at).getTime() > Date.now());

    if (!hasAccess && !forceSend) continue;

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
      const sentRecently = await alreadySentRecently({
        supabase,
        ownerEmail,
        now,
      });

      if (sentRecently) {
        results.push({
          owner_email: ownerEmail,
          skipped: true,
          reason: "already_sent_recently",
        });
        continue;
      }
    }

    const statuses = bizList.map((b: any) =>
      normalizeStatus(b.last_drift?.status)
    );

    const counts = statusCounts(statuses);
    const topStatus = pickTopStatus(statuses);
    const watchout = buildWatchout(topStatus);

    const portfolioName =
  bizList.length === 1
    ? bizList[0].name
    : "Your Portfolio";

    const { subject, text } = renderWeeklyBriefingEmail({
      portfolioName,
      status: topStatus,
      counts,
      watchout,
      openDriftUrl: `${baseUrl()}/app/alerts`,
    });

    if (dryRun) {
      results.push({
        owner_email: ownerEmail,
        skipped: true,
        reason: "dry_run",
        subject,
        status: topStatus,
      });
      continue;
    }

    const sendResult = await sendDriftEmail({
      to: ownerEmail,
      subject,
      text,
    });

    const emailId =
      (sendResult as any)?.data?.id ?? (sendResult as any)?.id ?? null;

    await supabase.from("email_logs").insert({
      business_id: null,
      email_type: "weekly_briefing",
      to_email: ownerEmail,
      subject,
      status: (sendResult as any)?.error ? "error" : "sent",
      provider: "resend",
      provider_message_id: emailId,
      meta: {
        kind: "weekly_briefing",
        dispatch,
        force_send: forceSend,
        window_start: isoDate(windowStart),
        window_end: isoDate(now),
        portfolio_status: topStatus,
        counts,
        businesses: bizList.map((b: any) => ({
          id: b.id,
          name: b.name,
          status: normalizeStatus(b.last_drift?.status),
        })),
        open_drift_url: `${baseUrl()}/app/alerts`,
      },
    });

    results.push({
      owner_email: ownerEmail,
      sent: true,
      email_id: emailId,
      status: topStatus,
    });
  }

  return NextResponse.json({
    ok: true,
    dispatch,
    dry_run: dryRun,
    results,
  });
}