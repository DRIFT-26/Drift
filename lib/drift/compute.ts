export type DriftStatus = "stable" | "softening" | "attention";

export type DriftResult = {
  status: DriftStatus;
  reasons: Array<{ code: string; detail: string; delta?: number }>;
};

function pctChange(current: number, baseline: number) {
  if (baseline === 0) return current === 0 ? 0 : 999;
  return (current - baseline) / baseline;
}

export function computeDrift(params: {
  baselineReviewCountPer14d: number;
  currentReviewCount14d: number;
  baselineSentimentAvg: number; // 0..1 in our seed
  currentSentimentAvg: number;

  baselineEngagement: number; // 0..1 in our seed
  currentEngagement: number;
}): DriftResult {
  const reasons: DriftResult["reasons"] = [];

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
  if (params.baselineEngagement > 0) {
    const engDrop = -pctChange(params.currentEngagement, params.baselineEngagement);
    if (engDrop >= 0.30) {
      reasons.push({ code: "ENG_DROP_30", detail: "Engagement down 30%+", delta: engDrop });
    } else if (engDrop >= 0.15) {
      reasons.push({ code: "ENG_DROP_15", detail: "Engagement down 15–25%", delta: engDrop });
    }
  }

  const hasAttention = reasons.some(r => r.code.includes("_30") || r.code.includes("_50"));
  const hasSoftening = reasons.length > 0;

  const status: DriftStatus = hasAttention ? "attention" : hasSoftening ? "softening" : "stable";
  return { status, reasons };
}