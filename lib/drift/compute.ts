// lib/drift/compute.ts

export type DriftStatus = "stable" | "softening" | "attention";
export type RiskLabel = "Low" | "Moderate" | "High";

export type DriftReason = {
  code: string;
  detail: string;
  delta?: number;
};

export type DriftMeta = {
  // Legacy fields (keep for UI + backward compat)
  reviewDrop: number;        // 0..1 where 1 = 100% drop
  engagementDrop: number;    // 0..1
  sentimentDelta: number;    // current - baseline (negative is bad)

  // MRI v1
  mriScore: number;          // 0..100 (higher = healthier)
  mriRaw: number;            // same as score for now (kept for future)
  mriPrev: number | null;    // placeholder for future week-over-week
  components: {
    reviews: number;         // 0..100
    engagement: number;      // 0..100
    sentiment: number;       // 0..100
  };
};

export type DriftResult = {
  status: DriftStatus;
  reasons: DriftReason[];
  meta: DriftMeta;
};

export type RiskProjection = {
  lowCents: number;
  highCents: number;
  estimatedImpact: number;
  label: RiskLabel;
};

export type ProjectRiskResult = {
  label: RiskLabel;
  bullets: string[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeDiv(n: number, d: number) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
}

/**
 * MRI v1 philosophy:
 * - Score starts at 100
 * - Penalties applied based on *momentum deterioration*
 * - Output: mriScore (0..100), plus components (0..100)
 */
export function computeDrift(args: {
  baselineReviewCountPer14d: number;
  currentReviewCount14d: number;
  baselineSentimentAvg: number; // 0..1 (or normalized upstream)
  currentSentimentAvg: number;  // 0..1
  baselineEngagement: number;   // 0..1 (or normalized upstream)
  currentEngagement: number;    // 0..1
}): DriftResult {
  const baselineReviews = Math.max(0, args.baselineReviewCountPer14d ?? 0);
  const currentReviews = Math.max(0, args.currentReviewCount14d ?? 0);

  const baselineEng = clamp(args.baselineEngagement ?? 0, 0, 1);
  const currentEng = clamp(args.currentEngagement ?? 0, 0, 1);

  const baselineSent = clamp(args.baselineSentimentAvg ?? 0, 0, 1);
  const currentSent = clamp(args.currentSentimentAvg ?? 0, 0, 1);

  // Deltas (legacy)
  const reviewDrop = clamp(1 - safeDiv(currentReviews, Math.max(1e-9, baselineReviews)), 0, 1);
  const engagementDrop = clamp(1 - safeDiv(currentEng, Math.max(1e-9, baselineEng || 1e-9)), 0, 1);
  const sentimentDelta = currentSent - baselineSent; // negative = worse

  // Components (0..100)
  const reviewsComponent = clamp(Math.round(100 * (1 - reviewDrop)), 0, 100);
  const engagementComponent = clamp(Math.round(100 * (1 - engagementDrop)), 0, 100);

  // Sentiment component: if sentimentDelta negative, reduce. If positive, keep near 100.
  // Max penalty here treats -0.5 as major.
  const sentimentPenalty = clamp(Math.round(clamp(-sentimentDelta, 0, 1) * 120), 0, 100);
  const sentimentComponent = clamp(100 - sentimentPenalty, 0, 100);

  // MRI score (weighted)
  // Reviews 40%, Engagement 35%, Sentiment 25%
  const mriRaw =
    reviewsComponent * 0.4 +
    engagementComponent * 0.35 +
    sentimentComponent * 0.25;

  const mriScore = clamp(Math.round(mriRaw), 0, 100);

  // Status from MRI
  const status: DriftStatus =
    mriScore < 60 ? "attention" :
    mriScore < 80 ? "softening" :
    "stable";

  // Reasons
  const reasons: DriftReason[] = [];
  if (reviewDrop >= 0.3) reasons.push({ code: "REV_FREQ_DROP_30", detail: "Review frequency down 30%+", delta: reviewDrop });
  if (engagementDrop >= 0.3) reasons.push({ code: "ENG_DROP_30", detail: "Engagement down 30%+", delta: engagementDrop });
  if (sentimentDelta <= -0.5) reasons.push({ code: "SENTIMENT_DROP_50", detail: "Sentiment down 0.50+", delta: sentimentDelta });

  return {
    status,
    reasons,
    meta: {
      reviewDrop,
      engagementDrop,
      sentimentDelta,
      mriScore,
      mriRaw,
      mriPrev: null,
      components: {
        reviews: reviewsComponent,
        engagement: engagementComponent,
        sentiment: sentimentComponent,
      },
    },
  };
}

/**
 * Turn drift signals into an executive-friendly risk label + bullets.
 * IMPORTANT: returns { label, bullets } (NOT an array).
 */
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
): ProjectRiskResult {
  const status = (drift as any)?.status ?? null;
  const mri = (drift as any)?.meta?.mriScore ?? (drift as any)?.mriScore ?? null;

  const reviewDrop = (drift as any)?.meta?.reviewDrop ?? (drift as any)?.reviewDrop ?? 0;
  const engagementDrop = (drift as any)?.meta?.engagementDrop ?? (drift as any)?.engagementDrop ?? 0;
  const sentimentDelta = (drift as any)?.meta?.sentimentDelta ?? (drift as any)?.sentimentDelta ?? 0;

  const isHigh =
    status === "attention" ||
    (typeof mri === "number" && mri < 60) ||
    reviewDrop >= 0.5 ||
    engagementDrop >= 0.5 ||
    sentimentDelta <= -0.5;

  const isModerate =
    !isHigh &&
    (status === "watch" || (typeof mri === "number" && mri < 80) || reviewDrop >= 0.3 || engagementDrop >= 0.3 || sentimentDelta <= -0.25);

  const label: RiskLabel = isHigh ? "High" : isModerate ? "Moderate" : "Low";

  const bullets =
    label === "High"
      ? [
          "You’re exposed: customer momentum is weakening fast.",
          "If this persists, revenue impact typically shows up within 2–4 weeks.",
          "Prioritize retention levers: response speed, offer clarity, experience consistency.",
        ]
      : label === "Moderate"
        ? [
            "Early drift detected: correctable if addressed quickly.",
            "Focus on the biggest lever (reviews, engagement, or sentiment) first.",
            "Small operational fixes can reverse trajectory within 7–14 days.",
          ]
        : [
            "Low risk: momentum is healthy.",
            "Keep cadence consistent—don’t change what’s working.",
            "Watch for sudden shifts after promotions, staffing changes, or seasonality.",
          ];

  return { label, bullets };
}

export function estimateRevenueImpact(args: {
  monthlyRevenue: number | null | undefined;
  drift:
    | DriftResult
    | {
        reviewDrop?: number | null;
        engagementDrop?: number | null;
        sentimentDelta?: number | null;
        mriScore?: number | null;
        status?: DriftStatus | null;
      };
}): RiskProjection {
  const monthlyRevenue = args.monthlyRevenue ?? null;

  if (!monthlyRevenue || monthlyRevenue <= 0) {
    return { lowCents: 0, highCents: 0, estimatedImpact: 0, label: "Low" };
  }

  const { label } = projectRisk(args.drift);

  const band =
    label === "High"
      ? { low: 0.08, high: 0.18 }
      : label === "Moderate"
        ? { low: 0.03, high: 0.08 }
        : { low: 0.0, high: 0.03 };

  const lowCents = Math.round(monthlyRevenue * band.low * 100);
  const highCents = Math.round(monthlyRevenue * band.high * 100);

  return {
    lowCents,
    highCents,
    estimatedImpact: Math.round((lowCents + highCents) / 2),
    label,
  };
}