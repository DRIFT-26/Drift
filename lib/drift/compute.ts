export type DriftStatus = "stable" | "softening" | "attention";

export type DriftReason = { code: string; detail: string; delta?: number };

export type DriftMeta = {
  reviewDrop?: number;        // 0..1 (e.g. 0.35 = 35% drop)
  engagementDrop?: number;    // 0..1
  sentimentDelta?: number;    // negative number when sentiment drops
};

export type DriftResult = {
  status: DriftStatus;
  reasons: DriftReason[];
  meta?: DriftMeta; // used for projections + revenue impact
};

function pctChange(current: number, baseline: number) {
  if (baseline === 0) return current === 0 ? 0 : 999;
  return (current - baseline) / baseline;
}

/**
 * Core drift computation (V1).
 * Adds `meta` so UI can estimate risk + revenue impact without re-deriving values.
 */
export function computeDrift(params: {
  baselineReviewCountPer14d: number;
  currentReviewCount14d: number;

  baselineSentimentAvg: number; // 0..1
  currentSentimentAvg: number;

  baselineEngagement: number; // 0..1
  currentEngagement: number;
  monthlyRevenue?: number | null;
}): DriftResult {
  const reasons: DriftReason[] = [];

  // Reviews: frequency drop
  const reviewDrop = -pctChange(params.currentReviewCount14d, params.baselineReviewCountPer14d);
  if (reviewDrop >= 0.30) {
    reasons.push({ code: "REV_FREQ_DROP_30", detail: "Review frequency down 30%+", delta: reviewDrop });
  } else if (reviewDrop >= 0.15) {
    reasons.push({ code: "REV_FREQ_DROP_15", detail: "Review frequency down 15–30%", delta: reviewDrop });
  }

  // Reviews: sentiment cooling
  const sentimentDelta = params.currentSentimentAvg - params.baselineSentimentAvg;
  if (sentimentDelta <= -0.50) {
    reasons.push({ code: "SENTIMENT_DROP_50", detail: "Sentiment down 0.50+", delta: sentimentDelta });
  } else if (sentimentDelta <= -0.25) {
    reasons.push({ code: "SENTIMENT_DROP_25", detail: "Sentiment down 0.25–0.40", delta: sentimentDelta });
  }

  // Engagement drop
  let engagementDrop = 0;
  if (params.baselineEngagement > 0) {
    engagementDrop = -pctChange(params.currentEngagement, params.baselineEngagement);
    if (engagementDrop >= 0.30) {
      reasons.push({ code: "ENG_DROP_30", detail: "Engagement down 30%+", delta: engagementDrop });
    } else if (engagementDrop >= 0.15) {
      reasons.push({ code: "ENG_DROP_15", detail: "Engagement down 15–25%", delta: engagementDrop });
    }
  }

  const hasAttention = reasons.some((r) => r.code.includes("_30") || r.code.includes("_50"));
  const hasSoftening = reasons.length > 0;

  const status: DriftStatus = hasAttention ? "attention" : hasSoftening ? "softening" : "stable";

  return {
    status,
    reasons,
    meta: {
      reviewDrop: Number.isFinite(reviewDrop) ? Math.max(0, reviewDrop) : 0,
      engagementDrop: Number.isFinite(engagementDrop) ? Math.max(0, engagementDrop) : 0,
      sentimentDelta: Number.isFinite(sentimentDelta) ? sentimentDelta : 0,
    },
  };
}

/**
 * V1 projections: short, human-readable “what could happen in 30 days”.
 * Takes the `meta` fields we store on alerts (or last_drift).
 */
export function projectRisk(input: {
  reviewDrop?: number | null;
  engagementDrop?: number | null;
  sentimentDelta?: number | null;
}): string[] {
  const reviewDrop = typeof input.reviewDrop === "number" ? input.reviewDrop : 0;
  const engagementDrop = typeof input.engagementDrop === "number" ? input.engagementDrop : 0;
  const sentimentDelta = typeof input.sentimentDelta === "number" ? input.sentimentDelta : 0;

  const out: string[] = [];

  if (reviewDrop >= 0.30) {
    out.push("Demand may soften over the next 2–4 weeks unless review volume rebounds.");
  } else if (reviewDrop >= 0.15) {
    out.push("Watch demand signals — review volume is trending down.");
  }

  if (engagementDrop >= 0.30) {
    out.push("Repeat visits / returning customers may drop within 2–3 weeks.");
  } else if (engagementDrop >= 0.15) {
    out.push("Engagement is cooling — consider a quick reactivation push.");
  }

  if (sentimentDelta <= -0.50) {
    out.push("Brand perception risk is elevated — address top issues immediately.");
  } else if (sentimentDelta <= -0.25) {
    out.push("Sentiment is trending down — review recent feedback and respond fast.");
  }

  return out;
}

/**
 * V1 “Estimated Revenue Impact”
 * Uses monthly_revenue as the baseline and applies a conservative risk band
 * based on the strongest drift signal we see.
 *
 * Returns cents so UI can format however it wants.
 */
export function estimateRevenueImpact(params: {
  monthlyRevenue?: number | null; // dollars (like 250000) OR cents (if you ever switch)
  monthlyRevenueCents?: number | null;
  reviewDrop?: number | null;
  engagementDrop?: number | null;
  sentimentDelta?: number | null;
}): {
  lowCents: number;
  highCents: number;
  label: "Low" | "Moderate" | "High";
} {
  // Prefer cents if provided, else assume `monthlyRevenue` is dollars.
  const baseCents =
    typeof params.monthlyRevenueCents === "number"
      ? Math.max(0, Math.floor(params.monthlyRevenueCents))
      : typeof params.monthlyRevenue === "number"
        ? Math.max(0, Math.floor(params.monthlyRevenue * 100))
        : 0;

  const reviewDrop = typeof params.reviewDrop === "number" ? params.reviewDrop : 0;
  const engagementDrop = typeof params.engagementDrop === "number" ? params.engagementDrop : 0;
  const sentimentDelta = typeof params.sentimentDelta === "number" ? params.sentimentDelta : 0;

  // Determine severity by strongest signal
  const severe =
    reviewDrop >= 0.30 || engagementDrop >= 0.30 || sentimentDelta <= -0.50;

  const moderate =
    !severe && (reviewDrop >= 0.15 || engagementDrop >= 0.15 || sentimentDelta <= -0.25);

  // Conservative bands for V1:
  // - Moderate: 1–3% monthly revenue at risk
  // - Severe:   3–7% monthly revenue at risk
  // - Stable:   0–1% (still show something if you want)
  let low = 0.0;
  let high = 0.01;
  let label: "Low" | "Moderate" | "High" = "Low";

  if (moderate) {
    low = 0.01;
    high = 0.03;
    label = "Moderate";
  }

  if (severe) {
    low = 0.03;
    high = 0.07;
    label = "High";
  }

  const lowCents = Math.round(baseCents * low);
  const highCents = Math.round(baseCents * high);

  return { lowCents, highCents, label };
}