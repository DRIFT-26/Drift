import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift } from "@/lib/drift/compute";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const supabase = supabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const businessId =
    typeof body?.business_id === "string" && body.business_id.length > 0
      ? body.business_id
      : "b4a655c8-0849-406c-8aee-938f49206235";

  // 1) Create two sources (reviews + engagement) if they don't exist
  const { data: existingSources } = await supabase
    .from("sources")
    .select("*")
    .eq("business_id", businessId);

  let reviewsSource = existingSources?.find((s: any) => s.type === "csv_reviews");
  let engagementSource = existingSources?.find((s: any) => s.type === "csv_engagement");

  if (!reviewsSource) {
    const { data, error } = await supabase
      .from("sources")
      .insert({ business_id: businessId, type: "csv_reviews", display_name: "Seed Reviews", is_connected: true })
      .select()
      .single();
    if (error) return NextResponse.json({ ok: false, step: "create_reviews_source", error: error.message }, { status: 500 });
    reviewsSource = data;
  }

  if (!engagementSource) {
    const { data, error } = await supabase
      .from("sources")
      .insert({ business_id: businessId, type: "csv_engagement", display_name: "Seed Engagement", is_connected: true })
      .select()
      .single();
    if (error) return NextResponse.json({ ok: false, step: "create_engagement_source", error: error.message }, { status: 500 });
    engagementSource = data;
  }

  // 2) Insert 60 days of snapshots
  // Baseline days (first 46 days): stable
  // Current window (last 14 days): noticeable decline to trigger softening/attention
  const today = new Date();
  const days = 60;

  const snapshotRows: any[] = [];

  for (let i = days; i >= 1; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const d = isoDate(date);

    const inCurrentWindow = i <= 14;

    // Reviews metrics:
    // baseline: ~1 review/day, sentiment ~0.85
    // current: 0–0.3 reviews/day equivalent, sentiment ~0.55
    const review_count = inCurrentWindow ? (i % 5 === 0 ? 1 : 0) : (i % 2 === 0 ? 1 : 0); // fewer reviews recently
    const sentiment_avg = inCurrentWindow ? 0.55 : 0.85;

    // Engagement metrics (0..1):
    // baseline: 0.35
    // current: 0.20 (drop ~43%)
    const engagement = inCurrentWindow ? 0.20 : 0.35;

    snapshotRows.push({
      business_id: businessId,
      source_id: reviewsSource.id,
      snapshot_date: d,
      metrics: { review_count, sentiment_avg },
    });

    snapshotRows.push({
      business_id: businessId,
      source_id: engagementSource.id,
      snapshot_date: d,
      metrics: { engagement },
    });
  }

  // Upsert to avoid duplicate errors if you re-run seed
  const { error: upsertErr } = await supabase
    .from("snapshots")
    .upsert(snapshotRows, { onConflict: "source_id,snapshot_date" });

  if (upsertErr) {
    return NextResponse.json({ ok: false, step: "upsert_snapshots", error: upsertErr.message }, { status: 500 });
  }

  // 3) Compute drift from snapshots (60-day baseline vs last 14 days)
  const baselineStart = new Date(today);
  baselineStart.setDate(today.getDate() - 60);
  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - 14);

  const baselineStartStr = isoDate(baselineStart);
  const currentStartStr = isoDate(currentStart);

  const { data: baseline } = await supabase
    .from("snapshots")
    .select("metrics,snapshot_date,source_id")
    .eq("business_id", businessId)
    .gte("snapshot_date", baselineStartStr);

  const { data: current } = await supabase
    .from("snapshots")
    .select("metrics,snapshot_date,source_id")
    .eq("business_id", businessId)
    .gte("snapshot_date", currentStartStr);

  const isReviews = (row: any) => row.source_id === reviewsSource.id;
  const isEng = (row: any) => row.source_id === engagementSource.id;

  const sum = (rows: any[], key: string) => rows.reduce((acc, r) => acc + (r.metrics?.[key] ?? 0), 0);
  const avg = (rows: any[], key: string) => {
    const vals = rows.map(r => r.metrics?.[key]).filter((v: any) => typeof v === "number");
    if (!vals.length) return 0;
    return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
  };

  const baselineReviews = (baseline ?? []).filter(isReviews);
  const currentReviews = (current ?? []).filter(isReviews);

  const baselineReviewTotal = sum(baselineReviews, "review_count");
  const currentReviewTotal = sum(currentReviews, "review_count");

  // baseline reviews scaled to a 14-day equivalent
  const baselineReviewPer14 = (baselineReviewTotal / 60) * 14;

  const baselineSent = avg(baselineReviews, "sentiment_avg");
  const currentSent = avg(currentReviews, "sentiment_avg");

  const baselineEng = avg((baseline ?? []).filter(isEng), "engagement");
  const currentEng = avg((current ?? []).filter(isEng), "engagement");

  // Seed should only insert data. Drift is computed by /api/jobs/daily.
const drift = null;

  // 4) Write an alert (always write one for seed so you can see it)
  const window_start = currentStartStr;
  const window_end = isoDate(today);

  // Seed creates demo data only. Alerts are created by /api/jobs/daily.
}