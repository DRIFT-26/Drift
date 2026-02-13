import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

function requireCronAuth(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return { ok: false as const, error: "CRON_SECRET missing" };

  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : null;

  const headerToken = req.headers.get("x-cron-secret")?.trim() || null;

  const token = bearerToken || headerToken;
  if (token !== cronSecret) return { ok: false as const, error: "Unauthorized" };

  return { ok: true as const };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const auth = requireCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const supabase = supabaseAdmin();

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const forceSend = url.searchParams.get("force_send") === "true";

  const startedAt = new Date();

  const { data: businesses, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,timezone,is_paid,alert_email,created_at")
    .order("created_at", { ascending: true });

  if (bErr) {
    return NextResponse.json(
      { ok: false, step: "read_businesses", error: bErr.message },
      { status: 500 }
    );
  }

  const results: any[] = [];

  for (const biz of businesses ?? []) {
    const isPaid = (biz as any).is_paid === true;

    // Weekly summaries are paid only (force_send does NOT override)
    if (!isPaid) {
      results.push({ business_id: biz.id, skipped: true, reason: "not_paid" });
      continue;
    }

    if (!biz.alert_email) {
      results.push({ business_id: biz.id, skipped: true, reason: "no_alert_email" });
      continue;
    }

    const today = new Date();
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - 7);

    const windowStartStr = isoDate(windowStart);
    const windowEndStr = isoDate(today);

    const { text } = renderStatusEmail({
      businessName: biz.name ?? biz.id,
      status: "stable",
      reasons: [],
      windowStart: windowStartStr,
      windowEnd: windowEndStr,
    });

    const subject = "DRIFT Weekly Check-In: All Clear 🟢";

    if (dryRun) {
      results.push({
        business_id: biz.id,
        skipped: true,
        reason: "dry_run",
        to: biz.alert_email,
      });
      continue;
    }

    try {
      const sendResult = await sendDriftEmail({
        to: biz.alert_email,
        subject,
        text,
      });

      const emailId = (sendResult as any)?.data?.id ?? (sendResult as any)?.id ?? null;

      await supabase.from("email_logs").insert({
        business_id: biz.id,
        email_type: "weekly_summary",
        to_email: biz.alert_email,
        subject,
        status: (sendResult as any)?.error ? "error" : "sent",
        provider: "resend",
        provider_message_id: emailId,
        error: (sendResult as any)?.error ? JSON.stringify((sendResult as any)?.error) : null,
        meta: {
          summary_window: "7d",
          window_start: windowStartStr,
          window_end: windowEndStr,
          force_send: forceSend,
          kind: "weekly_clear",
        },
      });

      results.push({
        business_id: biz.id,
        sent: true,
        to: biz.alert_email,
        email_id: emailId,
      });
    } catch (e: any) {
      // Best-effort failure log
      try {
        await supabase.from("email_logs").insert({
          business_id: biz.id,
          email_type: "weekly_summary",
          to_email: biz.alert_email,
          subject,
          status: "error",
          provider: "resend",
          provider_message_id: null,
          error: e?.message ?? String(e),
          meta: {
            summary_window: "7d",
            window_start: windowStartStr,
            window_end: windowEndStr,
            force_send: forceSend,
            kind: "weekly_clear",
          },
        });
      } catch {
        // ignore logging errors
      }

      results.push({
        business_id: biz.id,
        sent: false,
        to: biz.alert_email,
        error: e?.message ?? String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    duration_ms: Date.now() - startedAt.getTime(),
    results,
  });
}