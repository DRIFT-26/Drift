// lib/drift/types.ts

export type DriftStatus = "stable" | "softening" | "attention" | "watch";
export type DriftDirection = "up" | "flat" | "down";

export type DriftReason = {
  code: string;
  detail: string;
  delta?: number;
};

export type DriftEngine = "legacy_v1" | "revenue_v1";

export type DriftMeta = {
  engine: DriftEngine;
  direction?: DriftDirection | null;

  // One score the executive can learn and rely on (0..100)
  mriScore?: number | null;
  mriRaw?: number | null;
  mriPrev?: number | null;

  // Legacy components (kept for backwards compatibility)
  reviewDrop?: number | null;        // 0..1
  engagementDrop?: number | null;    // 0..1
  sentimentDelta?: number | null;    // -1..1

  // Revenue v1 fields
  revenue?: {
    baselineNetRevenueCents14d?: number | null;
    currentNetRevenueCents14d?: number | null;
    deltaPct?: number | null; // e.g. -0.22 = down 22%
  } | null;

  refunds?: {
    baselineRefundRate?: number | null; // 0..1
    currentRefundRate?: number | null;  // 0..1
    delta?: number | null;              // current - baseline
  } | null;

  components?: Record<string, number> | null;
};

export type DriftResult = {
  status: DriftStatus;
  reasons: DriftReason[];
  meta: DriftMeta;
};

export type LegacyComputeInput = {
  // Review frequency: baseline expected count over current window, vs actual current
  baselineReviewCountPer14d?: number | null;
  currentReviewCount14d?: number | null;

  baselineSentimentAvg?: number | null; // 0..1
  currentSentimentAvg?: number | null;  // 0..1

  baselineEngagement?: number | null;   // 0..1
  currentEngagement?: number | null;    // 0..1
};

export type RevenueComputeInput = {
  // Net revenue over 14 days
  baselineNetRevenueCents14d?: number | null;
  currentNetRevenueCents14d?: number | null;

  // Refund rate over the period (refunds / revenue), 0..1
  baselineRefundRate?: number | null;
  currentRefundRate?: number | null;
};

export type ComputeInput = LegacyComputeInput & RevenueComputeInput;

export type RiskLabel = "Low" | "Moderate" | "High";

export type RiskResult = {
  label: RiskLabel;
  bullets: string[];
};

export type RiskProjection = {
  label: RiskLabel;
  lowCents: number;
  highCents: number;
  estimatedImpactCents: number;
};