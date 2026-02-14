import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
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
  const forceSend = url.searchParams.get("force_send") === "true"; // logged only; does not bypass paid gate

  const startedAt = new Date();

  // Load businesses
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

    // Weekly summaries are paid (force_send does NOT override)
    if (!isPaid) {
      results.push({ business_id: biz.id, skipped: true, reason: "not_paid" });
      continue;
    }

    if (!biz.alert_email) {
      results.push({ business_id: biz.id, skipped: true, reason: "no_alert_email" });
      continue;
    }

    // Window: last 7 days
    const today = new Date();
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - 7);

    const windowStartStr = isoDate(windowStart);
    const windowEndStr = isoDate(today);

    const { text } = renderStatusEmail({
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
      // best-effort failure log
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