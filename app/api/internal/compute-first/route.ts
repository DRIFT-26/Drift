import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift } from "@/lib/drift/compute";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const supabase = supabaseAdmin();
  const body = await req.json().catch(() => null);

  const businessId = body?.business_id as string | undefined;
  if (!businessId) {
    return NextResponse.json({ ok: false, error: "business_id required" }, { status: 400 });
  }

  const { data: biz, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,alert_email")
    .eq("id", businessId)
    .single();

  if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });

  const baselineDays = 60;
  const currentDays = 14;

  const today = new Date();
  const baselineStart = new Date(today);
  baselineStart.setDate(today.getDate() - baselineDays);

  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - currentDays);

  const baselineStartStr = isoDate(baselineStart);
  const currentStartStr = isoDate(currentStart);

  const { data: sources, error: sErr } = await supabase
    .from("sources")
    .select("id,type,is_connected")
    .eq("business_id", businessId);

  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  const connected = (sources ?? []).filter(s => s.is_connected);
  const reviewsSource = connected.find(s => s.type === "csv_reviews" || s.type === "google_reviews");
  const engagementSource = connected.find(s => s.type === "csv_engagement" || s.type === "klaviyo");

  const { data: baselineRows, error: baseErr } = await supabase
    .from("snapshots")
    .select("source_id,metrics")
    .eq("business_id", businessId)
    .gte("snapshot_date", baselineStartStr);

  if (baseErr) return NextResponse.json({ ok: false, error: baseErr.message }, { status: 500 });

  const { data: currentRows, error: curErr } = await supabase
    .from("snapshots")
    .select("source_id,metrics")
    .eq("business_id", businessId)
    .gte("snapshot_date", currentStartStr);

  if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });

  const sum = (rows: any[], key: string) =>
    rows.reduce((acc, r) => acc + (r.metrics?.[key] ?? 0), 0);

  const avg = (rows: any[], key: string) => {
    const vals = rows.map(r => r.metrics?.[key]).filter(v => typeof v === "number");
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const baselineReviews = reviewsSource ? (baselineRows ?? []).filter(r => r.source_id === reviewsSource.id) : [];
  const currentReviews = reviewsSource ? (currentRows ?? []).filter(r => r.source_id === reviewsSource.id) : [];

  const baselineEng = engagementSource ? (baselineRows ?? []).filter(r => r.source_id === engagementSource.id) : [];
  const currentEng = engagementSource ? (currentRows ?? []).filter(r => r.source_id === engagementSource.id) : [];

    const drift = computeDrift({
    baselineReviewCountPer14d: (sum(baselineReviews, "review_count") / baselineDays) * currentDays,
    currentReviewCount14d: sum(currentReviews, "review_count"),
    baselineSentimentAvg: avg(baselineReviews, "sentiment_avg"),
    currentSentimentAvg: avg(currentReviews, "sentiment_avg"),
    // compute-first route doesn’t currently load engagement rows
    baselineEngagement: 0,
    currentEngagement: 0,
  } as any);

  // Insert initial alert (always, as "current state")
  const { data: alert, error: aErr } = await supabase
    .from("alerts")
    .insert({
      business_id: businessId,
      status: drift.status,
      reasons: drift.reasons,
      window_start: currentStartStr,
      window_end: isoDate(today),
    })
    .select()
    .single();

  if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });

  // lib/email/templates.ts expects: "stable" | "softening" | "attention"
const statusForEmail = (s: any): "stable" | "softening" | "attention" => {
  if (s === "watch") return "softening";
  return s === "stable" || s === "softening" || s === "attention" ? s : "attention";
};
  
  // Send first status email
  if (biz.alert_email) {
    const { subject, text } = renderStatusEmail({
      businessName: biz.name,
      status: statusForEmail(drift.status),
      reasons: drift.reasons,
      windowStart: currentStartStr,
      windowEnd: isoDate(today),
    });

    await sendDriftEmail({
      to: biz.alert_email,
      subject: `DRIFT First Read: ${drift.status.toUpperCase()}`,
      text,
    });
  }

  return NextResponse.json({ ok: true, drift, alert_id: alert.id });
}