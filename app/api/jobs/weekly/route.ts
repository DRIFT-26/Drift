import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

  const supabase = supabaseAdmin();

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const forceSend = url.searchParams.get("force_send") === "true";

  const startedAt = new Date();

  // Load businesses (include paid + email)
  const { data: businesses, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,timezone,is_paid,alert_email")
    .order("created_at", { ascending: true });

  if (bErr) {
    return NextResponse.json(
      { ok: false, step: "read_businesses", error: bErr.message },
      { status: 500 }
    );
  }

  const results: any[] = [];

  for (const biz of businesses ?? []) {
    try {
      const isPaid = (biz as any).is_paid === true;

      // Weekly summaries are a paid feature.
      if (!isPaid) {
  results.push({ business_id: biz.id, skipped: true, reason: "not_paid" });
  continue;
}

      // Need an email to send to
      if (!biz.alert_email) {
        results.push({ business_id: biz.id, skipped: true, reason: "no_alert_email" });
        continue;
      }

      // Window (last 7 days)
      const today = new Date();
      const windowStart = new Date(today);
      windowStart.setDate(today.getDate() - 7);

      const windowStartStr = isoDate(windowStart);
      const windowEndStr = isoDate(today);

      // For now, weekly is "All Clear" (stable) summary.
      // (Later we can summarize the week’s alerts.)
      const { subject: _subject, text } = renderStatusEmail({
        businessName: biz.name,
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
        });
        continue;
      }

      const sendResult = await sendDriftEmail({
        to: biz.alert_email,
        subject,
        text,
      });

      // Log email send
      await supabase.from("email_logs").insert({
        business_id: biz.id,
        email_type: "weekly_summary",
        to_email: biz.alert_email,
        subject,
        status: (sendResult as any)?.error ? "error" : "sent",
        provider: "resend",
        provider_message_id:
          (sendResult as any)?.data?.id ??
          (sendResult as any)?.id ??
          null,
        error: (sendResult as any)?.error
          ? JSON.stringify((sendResult as any)?.error)
          : null,
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
        email_id:
          (sendResult as any)?.data?.id ??
          (sendResult as any)?.id ??
          null,
      });
    } catch (e: any) {
      // Try to log the failure as well (best effort)
      try {
        if (!dryRun && biz?.id && biz?.alert_email) {
          await supabase.from("email_logs").insert({
            business_id: biz.id,
            email_type: "weekly_summary",
            to_email: biz.alert_email,
            subject: "DRIFT Weekly Check-In: All Clear 🟢",
            status: "error",
            provider: "resend",
            provider_message_id: null,
            error: e?.message ?? String(e),
            meta: { force_send: forceSend, kind: "weekly_clear" },
          });
        }
      } catch {
        // ignore logging errors
      }

      results.push({
        business_id: biz?.id ?? null,
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