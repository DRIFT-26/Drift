import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import {
  renderTrialExpiredDay0Email,
  renderTrialExpiredDay2Email,
  renderTrialExpiredDay5Email,
} from "@/lib/email/templates";

export const runtime = "nodejs";

function daysSince(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || "";

    if (cronSecret) {
      const expected = `Bearer ${cronSecret}`;
      if (authHeader !== expected) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const supabase = supabaseAdmin();

    const { data: businesses, error } = await supabase
      .from("businesses")
      .select("id,name,alert_email,trial_ends_at,billing_status")
      .not("trial_ends_at", "is", null);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    let processed = 0;

    for (const b of businesses ?? []) {
      if (!b.alert_email || !b.trial_ends_at) continue;
      if (b.billing_status === "active" || b.billing_status === "internal") {
        continue;
      }

      const endedAt = new Date(b.trial_ends_at).getTime();
      if (!Number.isFinite(endedAt) || endedAt > Date.now()) continue;

      const days = daysSince(b.trial_ends_at);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://drifthq.co";
      const upgradeUrl = `${appUrl}/upgrade?business_id=${encodeURIComponent(
        b.id
      )}`;

      let emailType: string | null = null;
      let rendered:
        | ReturnType<typeof renderTrialExpiredDay0Email>
        | ReturnType<typeof renderTrialExpiredDay2Email>
        | ReturnType<typeof renderTrialExpiredDay5Email>
        | null = null;

      if (days === 0) {
        emailType = "trial_expired_day_0";
        rendered = renderTrialExpiredDay0Email({
          businessName: b.name || "Business",
          upgradeUrl,
        });
      } else if (days === 2) {
        emailType = "trial_expired_day_2";
        rendered = renderTrialExpiredDay2Email({
          businessName: b.name || "Business",
          upgradeUrl,
        });
      } else if (days === 5) {
        emailType = "trial_expired_day_5";
        rendered = renderTrialExpiredDay5Email({
          businessName: b.name || "Business",
          upgradeUrl,
        });
      }

      if (!emailType || !rendered) continue;

      const { data: existing } = await supabase
        .from("email_logs")
        .select("id")
        .eq("business_id", b.id)
        .eq("email_type", emailType)
        .maybeSingle();

      if (existing?.id) continue;

      const sendResult = await sendDriftEmail({
        to: b.alert_email,
        subject: rendered.subject,
        text: rendered.text,
      });

      await supabase.from("email_logs").insert({
        business_id: b.id,
        email_type: emailType,
        subject: rendered.subject,
        provider: "resend",
        provider_message_id:
          typeof (sendResult as any)?.data?.id === "string"
            ? (sendResult as any).data.id
            : null,
        meta: {
          category: "trial_expiration",
          day_offset: days,
        },
      });

      processed += 1;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}