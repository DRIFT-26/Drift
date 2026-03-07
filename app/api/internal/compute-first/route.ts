import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift } from "@/lib/drift/compute";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";
import { makeShareToken } from "@/lib/share";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

type EmailStatus = "stable" | "softening" | "attention";

function statusForEmail(status: string | null | undefined): EmailStatus {
  if (status === "watch") return "softening";
  if (status === "stable" || status === "softening" || status === "attention") {
    return status;
  }
  return "attention";
}

function normalizeReason(reason: unknown): string {
  if (typeof reason === "string") return reason;

  if (reason && typeof reason === "object") {
    const r = reason as Record<string, unknown>;
    if (typeof r.message === "string") return r.message;
    if (typeof r.label === "string") return r.label;
    if (typeof r.reason === "string") return r.reason;
  }

  return "Signal detected.";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json().catch(() => null);

    const businessId = body?.business_id as string | undefined;
    if (!businessId) {
      return NextResponse.json(
        { ok: false, error: "business_id required" },
        { status: 400 }
      );
    }

    const { data: biz, error: bErr } = await supabase
      .from("businesses")
      .select("id,name,alert_email")
      .eq("id", businessId)
      .single();

    if (bErr || !biz) {
      return NextResponse.json(
        { ok: false, error: bErr?.message ?? "Business not found" },
        { status: 500 }
      );
    }

    const baselineDays = 60;
    const currentDays = 14;

    const today = new Date();

    const baselineStart = new Date(today);
    baselineStart.setDate(today.getDate() - baselineDays);

    const currentStart = new Date(today);
    currentStart.setDate(today.getDate() - currentDays);

    const baselineStartStr = isoDate(baselineStart);
    const currentStartStr = isoDate(currentStart);
    const todayStr = isoDate(today);

    const { data: sources, error: sErr } = await supabase
      .from("sources")
      .select("id,type,is_connected")
      .eq("business_id", businessId);

    if (sErr) {
      return NextResponse.json(
        { ok: false, error: sErr.message },
        { status: 500 }
      );
    }

    const connected = (sources ?? []).filter((s) => s.is_connected);

    const reviewsSource = connected.find(
      (s) => s.type === "csv_reviews" || s.type === "google_reviews"
    );

    const engagementSource = connected.find(
      (s) => s.type === "csv_engagement" || s.type === "klaviyo"
    );

    const { data: baselineRows, error: baseErr } = await supabase
      .from("snapshots")
      .select("source_id,metrics")
      .eq("business_id", businessId)
      .gte("snapshot_date", baselineStartStr);

    if (baseErr) {
      return NextResponse.json(
        { ok: false, error: baseErr.message },
        { status: 500 }
      );
    }

    const { data: currentRows, error: curErr } = await supabase
      .from("snapshots")
      .select("source_id,metrics")
      .eq("business_id", businessId)
      .gte("snapshot_date", currentStartStr);

    if (curErr) {
      return NextResponse.json(
        { ok: false, error: curErr.message },
        { status: 500 }
      );
    }

    const sum = (rows: any[], key: string) =>
      rows.reduce((acc, r) => acc + (r.metrics?.[key] ?? 0), 0);

    const avg = (rows: any[], key: string) => {
      const vals = rows
        .map((r) => r.metrics?.[key])
        .filter((v) => typeof v === "number");

      if (!vals.length) return 0;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const baselineReviews = reviewsSource
      ? (baselineRows ?? []).filter((r) => r.source_id === reviewsSource.id)
      : [];

    const currentReviews = reviewsSource
      ? (currentRows ?? []).filter((r) => r.source_id === reviewsSource.id)
      : [];

    const baselineEng = engagementSource
      ? (baselineRows ?? []).filter((r) => r.source_id === engagementSource.id)
      : [];

    const currentEng = engagementSource
      ? (currentRows ?? []).filter((r) => r.source_id === engagementSource.id)
      : [];

    const drift = computeDrift({
      baselineReviewCountPer14d:
        (sum(baselineReviews, "review_count") / baselineDays) * currentDays,
      currentReviewCount14d: sum(currentReviews, "review_count"),
      baselineSentimentAvg: avg(baselineReviews, "sentiment_avg"),
      currentSentimentAvg: avg(currentReviews, "sentiment_avg"),
      baselineEngagement: sum(baselineEng, "engagement"),
      currentEngagement: sum(currentEng, "engagement"),
    } as any);

    const share_token = makeShareToken();
    const share_expires_at = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 14
    ).toISOString();

    const shareUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/s/${share_token}`
      : undefined;

    const { data: alert, error: aErr } = await supabase
      .from("alerts")
      .insert({
        business_id: businessId,
        status: drift.status,
        reasons: drift.reasons,
        share_token,
        share_expires_at,
      })
      .select()
      .single();

    if (aErr || !alert) {
      return NextResponse.json(
        { ok: false, error: aErr?.message ?? "Failed to create alert" },
        { status: 500 }
      );
    }

    if (biz.alert_email) {
      const emailReasons = (drift.reasons ?? []).map(normalizeReason);

      const { subject, text } = renderStatusEmail({
        businessName: biz.name,
        status: statusForEmail(drift.status),
        reasons: emailReasons,
        windowStart: currentStartStr,
        windowEnd: todayStr,
        shareUrl,
      });

      await sendDriftEmail({
        to: biz.alert_email,
        subject,
        text,
      });
    }

    return NextResponse.json({
      ok: true,
      drift,
      alert_id: alert.id,
      share_token,
      share_url: shareUrl ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}