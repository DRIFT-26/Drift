// lib/drift/compute.ts

export type DriftStatus = "stable" | "watch" | "softening" | "attention";

export type DriftReason = {
  code: string;
  detail: string;
  delta?: number;
};

export type RiskLabel = "Low" | "Moderate" | "High";

export type RiskProjection = {
  label: RiskLabel;
  bullets: string[];
};

export function projectRisk(
  drift:
    | DriftResult
    | {
        reviewDrop?: number | null;
        engagementDrop?: number | null;
        sentimentDelta?: number | null;
        mriScore?: number | null;
        status?: DriftStatus | null;
      }
): RiskProjection {
  const status = (drift as any)?.status ?? null;
  const mriScore = (drift as any)?.mriScore ?? (drift as any)?.meta?.mriScore ?? null;

  // If MRI exists, use it as primary risk classifier
  let label: RiskLabel = "Low";
  if (typeof mriScore === "number") {
    if (mriScore >= 70) label = "High";
    else if (mriScore >= 35) label = "Moderate";
    else label = "Low";
  } else {
    // fallback: status-based
    if (status === "attention" || status === "drift") label = "High";
    else if (status === "softening" || status === "watch") label = "Moderate";
    else label = "Low";
  }

  const reviewDrop = (drift as any)?.reviewDrop ?? (drift as any)?.meta?.reviewDrop ?? null;
  const engagementDrop = (drift as any)?.engagementDrop ?? (drift as any)?.meta?.engagementDrop ?? null;
  const sentimentDelta = (drift as any)?.sentimentDelta ?? (drift as any)?.meta?.sentimentDelta ?? null;

  const bullets: string[] = [];

  // Plain-English bullets (keep v1 simple & exec-friendly)
  if (label === "High") {
    bullets.push("Revenue momentum risk is elevated over the next 30–60 days.");
  } else if (label === "Moderate") {
    bullets.push("Revenue momentum is softening — worth monitoring this week.");
  } else {
    bullets.push("Momentum appears stable — no immediate action required.");
  }

  if (typeof reviewDrop === "number" && reviewDrop > 0) {
    bullets.push("Demand signals are down (fewer inbound signals / reviews).");
  }

  if (typeof engagementDrop === "number" && engagementDrop > 0) {
    bullets.push("Customer engagement is down versus baseline.");
  }

  if (typeof sentimentDelta === "number" && sentimentDelta < 0) {
    bullets.push("Customer sentiment is trending downward.");
  }

  // Ensure we always have something to show
  if (!bullets.length) bullets.push("No significant risk drivers detected in the current window.");

  return { label, bullets };
}

export type DriftResult = {
  status: DriftStatus;
  reasons: DriftReason[];
  meta: {
    engine: "reputation_v1" | "revenue_v1";
    direction: "up" | "stable" | "decelerating" | "drift";

    // Revenue engine fields
    revenueVelocityRatio?: number | null; // current vs baseline (per-day)
    momentumDelta?: number | null; // acceleration/deceleration within current window
    refundRateDelta?: number | null; // current - baseline

    // Reputation engine fields (legacy)
    reviewDrop?: number | null;
    engagementDrop?: number | null;
    sentimentDelta?: number | null;
    mriScore?: number | null;
    mriRaw?: number | null;
    mriPrev?: number | null;
    components?: Record<string, number> | null;
  };
};

export type RevenueComputeInput = {
  // Totals (over baseline/current windows)
  baselineNetRevenueCents: number; // 60d total
  currentNetRevenueCents: number; // 14d total

  baselineRefundsCents: number; // 60d total refunds
  currentRefundsCents: number; // 14d total refunds

  // For acceleration inside current window (optional but recommended)
  currentNetRevenueLast7Cents?: number; // last 7 of the 14
  currentNetRevenuePrev7Cents?: number; // first 7 of the 14

  baselineDays?: number; // default 60
  currentDays?: number; // default 14
};

export type ReputationComputeInput = {
  baselineReviewCountPer14d: number;
  currentReviewCount14d: number;
  baselineSentimentAvg: number;
  currentSentimentAvg: number;
  baselineEngagement: number;
  currentEngagement: number;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function safeDiv(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeRevenueV1(input: RevenueComputeInput): DriftResult {
  const baselineDays = Math.max(1, input.baselineDays ?? 60);
  const currentDays = Math.max(1, input.currentDays ?? 14);

  const basePerDay = safeDiv(input.baselineNetRevenueCents, baselineDays);
  const curPerDay = safeDiv(input.currentNetRevenueCents, currentDays);

  // Revenue velocity ratio (current per-day vs baseline per-day)
  const velocityRatio = basePerDay > 0 ? curPerDay / basePerDay : (curPerDay > 0 ? 1 : 0);

  // Refund rate (refunds / (refunds + net)) approximation
  const baseGross = input.baselineNetRevenueCents + input.baselineRefundsCents;
  const curGross = input.currentNetRevenueCents + input.currentRefundsCents;

  const baseRefundRate = baseGross > 0 ? input.baselineRefundsCents / baseGross : 0;
  const curRefundRate = curGross > 0 ? input.currentRefundsCents / curGross : 0;

  const refundRateDelta = curRefundRate - baseRefundRate;

  // Momentum delta: compare last 7 days vs previous 7 days (within current window)
  const last7 = input.currentNetRevenueLast7Cents ?? 0;
  const prev7 = input.currentNetRevenuePrev7Cents ?? 0;

  const last7PerDay = safeDiv(last7, 7);
  const prev7PerDay = safeDiv(prev7, 7);

  const momentumDelta = prev7PerDay > 0 ? (last7PerDay - prev7PerDay) / prev7PerDay : (last7PerDay > 0 ? 1 : 0);

  // Direction buckets (executive simple)
  let direction: DriftResult["meta"]["direction"] = "stable";
  if (velocityRatio >= 1.05) direction = "up";
  else if (velocityRatio <= 0.85) direction = "drift";
  else if (velocityRatio < 0.95) direction = "decelerating";
  else direction = "stable";

  const reasons: DriftReason[] = [];

  // Reasons & status thresholds (plain english, no charts)
  // Revenue Velocity
  if (velocityRatio <= 0.85) {
    reasons.push({
      code: "REV_VELOCITY_DROP_15",
      detail: "Revenue velocity down 15%+ vs baseline",
      delta: round2(1 - velocityRatio),
    });
  } else if (velocityRatio < 0.95) {
    reasons.push({
      code: "REV_VELOCITY_SOFTENING",
      detail: "Revenue velocity softening vs baseline",
      delta: round2(1 - velocityRatio),
    });
  }

  // Momentum Delta (acceleration/deceleration)
  if (momentumDelta <= -0.15) {
    reasons.push({
      code: "MOMENTUM_DECELERATING",
      detail: "Momentum decelerating (last 7 days weaker than prior 7)",
      delta: round2(momentumDelta),
    });
  } else if (momentumDelta >= 0.15) {
    reasons.push({
      code: "MOMENTUM_ACCELERATING",
      detail: "Momentum accelerating (last 7 days stronger than prior 7)",
      delta: round2(momentumDelta),
    });
  }

  // Refund trend
  if (refundRateDelta >= 0.02) {
    reasons.push({
      code: "REFUND_RATE_UP",
      detail: "Refund rate trending up",
      delta: round2(refundRateDelta),
    });
  }

  // Status ladder
  // stable -> watch -> softening -> attention
  let status: DriftStatus = "stable";

  const hardVelocityHit = velocityRatio <= 0.85;
  const softVelocityHit = velocityRatio < 0.95;
  const refundsHit = refundRateDelta >= 0.02;
  const momentumHit = momentumDelta <= -0.15;

  if (hardVelocityHit || (softVelocityHit && (refundsHit || momentumHit))) status = "attention";
  else if (softVelocityHit || refundsHit || momentumHit) status = "softening";
  else status = "stable";

  // If it’s stable but we have a “positive” reason, mark watch (optional)
  if (status === "stable" && reasons.some(r => r.code === "MOMENTUM_ACCELERATING")) {
    status = "watch";
  }

  if (!reasons.length) {
    reasons.push({ code: "NO_SIGNAL", detail: "No concerning signals detected" });
  }

  return {
    status,
    reasons: reasons.slice(0, 3),
    meta: {
      engine: "revenue_v1",
      direction,
      revenueVelocityRatio: Number.isFinite(velocityRatio) ? round2(velocityRatio) : null,
      momentumDelta: Number.isFinite(momentumDelta) ? round2(momentumDelta) : null,
      refundRateDelta: Number.isFinite(refundRateDelta) ? round2(refundRateDelta) : null,
    },
  };
}

function computeReputationV1(input: ReputationComputeInput): DriftResult {
  // Legacy engine used before revenue is wired everywhere.
  const reviewDrop =
    input.baselineReviewCountPer14d > 0
      ? 1 - safeDiv(input.currentReviewCount14d, input.baselineReviewCountPer14d)
      : input.currentReviewCount14d > 0
        ? 0
        : 1;

  const engagementDrop =
    input.baselineEngagement > 0 ? 1 - safeDiv(input.currentEngagement, input.baselineEngagement) : 0;

  const sentimentDelta = input.currentSentimentAvg - input.baselineSentimentAvg;

  // Very light “MRI” compatibility so the UI doesn’t break.
  const components = {
    reviews: Math.max(0, Math.round(clamp01(reviewDrop) * 10)),
    engagement: Math.max(0, Math.round(clamp01(engagementDrop) * 10)),
    sentiment: Math.max(0, Math.round(clamp01(-sentimentDelta) * 10)),
  };

  const mriRaw = components.reviews + components.engagement + components.sentiment;
  const mriScore = Math.max(0, Math.min(100, Math.round((mriRaw / 30) * 100)));

  const reasons: DriftReason[] = [];
  if (reviewDrop >= 0.3) reasons.push({ code: "REV_FREQ_DROP_30", detail: "Review frequency down 30%+", delta: reviewDrop });
  if (engagementDrop >= 0.3) reasons.push({ code: "ENG_DROP_30", detail: "Engagement down 30%+", delta: engagementDrop });
  if (sentimentDelta <= -0.5) reasons.push({ code: "SENTIMENT_DROP_50", detail: "Sentiment down 0.50+", delta: sentimentDelta });

  let status: DriftStatus = "stable";
  if (reasons.length >= 2) status = "attention";
  else if (reasons.length === 1) status = "softening";

  return {
    status,
    reasons: reasons.slice(0, 3),
    meta: {
      engine: "reputation_v1",
      direction: status === "stable" ? "stable" : status === "softening" ? "decelerating" : "drift",
      reviewDrop,
      engagementDrop,
      sentimentDelta,
      mriScore,
      mriRaw,
      mriPrev: null,
      components,
    },
  };
}

/**
 * computeDrift now supports BOTH engines.
 * Daily route should pass revenue input when stripe_revenue is connected.
 */
export function computeDrift(input: RevenueComputeInput | ReputationComputeInput): DriftResult {
  if ((input as any).baselineNetRevenueCents !== undefined) {
    return computeRevenueV1(input as RevenueComputeInput);
  }
  return computeReputationV1(input as ReputationComputeInput);
}

  // Legacy: use drops/deltas
  const reviewDrop = Number(drift?.meta?.reviewDrop ?? 0);
  const engagementDrop = Number(drift?.meta?.engagementDrop ?? 0);
  const sentimentDelta = Number(drift?.meta?.sentimentDelta ?? 0);

  const hit = (reviewDrop >= 0.3 ? 1 : 0) + (engagementDrop >= 0.3 ? 1 : 0) + (sentimentDelta <= -0.5 ? 1 : 0);
  if (hit >= 2) return { label: "High" };
  if (hit === 1) return { label: "Moderate" };
  return { label: "Low" };
}

export function estimateRevenueImpact(args: {
  monthlyRevenueCents: number | null | undefined;
  drift: DriftResult | any;
}): RiskProjection {
  const monthlyRevenueCents = args.monthlyRevenueCents ?? null;

  if (!monthlyRevenueCents || monthlyRevenueCents <= 0) {
    return { lowCents: 0, highCents: 0, estimatedImpact: 0, label: "Low" };
  }

  const { label } = projectRisk(args.drift);

  const band =
    label === "High"
      ? { low: 0.08, high: 0.18 }
      : label === "Moderate"
        ? { low: 0.03, high: 0.08 }
        : { low: 0.0, high: 0.03 };

  const lowCents = Math.round(monthlyRevenueCents * band.low);
  const highCents = Math.round(monthlyRevenueCents * band.high);

  return {
    lowCents,
    highCents,
    estimatedImpact: Math.round((lowCents + highCents) / 2),
    label,
  };
}