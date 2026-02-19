// lib/drift/engines/legacy.ts
import type { DriftReason, DriftResult, DriftStatus, LegacyComputeInput } from "../types";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function computeLegacyV1(input: LegacyComputeInput): DriftResult {
  const baselinePer14 = Number(input.baselineReviewCountPer14d ?? 0);
  const current14 = Number(input.currentReviewCount14d ?? 0);

  const baseSent = Number(input.baselineSentimentAvg ?? 0);
  const curSent = Number(input.currentSentimentAvg ?? 0);

  const baseEng = Number(input.baselineEngagement ?? 0);
  const curEng = Number(input.currentEngagement ?? 0);

  const reviewDrop =
    baselinePer14 > 0 ? clamp01((baselinePer14 - current14) / baselinePer14) : current14 === 0 ? 1 : 0;

  const engagementDrop = baseEng > 0 ? clamp01((baseEng - curEng) / baseEng) : curEng === 0 ? 1 : 0;

  const sentimentDelta = clamp01(curSent) - clamp01(baseSent); // negative means worse

  const reasons: DriftReason[] = [];

  if (reviewDrop >= 0.3) {
    reasons.push({
      code: "REV_FREQ_DROP_30",
      detail: "Review frequency down 30%+",
      delta: reviewDrop,
    });
  }

  if (engagementDrop >= 0.3) {
    reasons.push({
      code: "ENG_DROP_30",
      detail: "Engagement down 30%+",
      delta: engagementDrop,
    });
  }

  if (sentimentDelta <= -0.5) {
    reasons.push({
      code: "SENTIMENT_DROP_50",
      detail: "Sentiment down 0.50+",
      delta: sentimentDelta,
    });
  }

  // Status
  const hits =
    (reviewDrop >= 0.3 ? 1 : 0) +
    (engagementDrop >= 0.3 ? 1 : 0) +
    (sentimentDelta <= -0.5 ? 1 : 0);

  const status: DriftStatus =
    hits >= 2 ? "attention" : hits === 1 ? "softening" : "stable";

  // Simple MRI score (0..100), high = healthy
  const penaltyReviews = Math.round(clamp01(reviewDrop) * 40);
  const penaltyEng = Math.round(clamp01(engagementDrop) * 30);
  const penaltySent = sentimentDelta < 0 ? Math.round(clamp01(-sentimentDelta) * 30) : 0;
  const mriRaw = 100 - (penaltyReviews + penaltyEng + penaltySent);
  const mriScore = Math.max(0, Math.min(100, Math.round(mriRaw)));

  return {
    status,
    reasons,
    meta: {
      engine: "legacy_v1",
      reviewDrop,
      engagementDrop,
      sentimentDelta,
      mriScore,
      mriRaw,
      mriPrev: null,
      components: {
        reviews: penaltyReviews,
        engagement: penaltyEng,
        sentiment: penaltySent,
      },
    },
  };
}