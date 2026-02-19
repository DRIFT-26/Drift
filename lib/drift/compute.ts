// lib/drift/compute.ts
import type {
  ComputeInput,
  DriftResult,
  DriftStatus,
  RiskLabel,
  RiskProjection,
  RiskResult,
} from "./types";

import { computeLegacyV1 } from "./engines/legacy";
import { computeRevenueV1 } from "./engines/revenue_v1";

export type {
  DriftResult,
  DriftStatus,
  RiskLabel,
  RiskResult,
  RiskProjection,
  ComputeInput,
} from "./types";

function n(v: any): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * Backwards-compat normalization:
 * - Supports older keys that existed before revenue_v1 landed
 * - Allows routes like seed/compute-first to call computeDrift without rewrites
 */
function normalizeInput(input: any): ComputeInput {
  const out: ComputeInput = {};

  // Legacy (reviews/engagement/sentiment)
  out.baselineReviewCountPer14d =
    n(input?.baselineReviewCountPer14d) ??
    n(input?.baselineReviewCountPer14) ??
    null;

  out.currentReviewCount14d =
    n(input?.currentReviewCount14d) ??
    n(input?.currentReviewCount) ??
    null;

  out.baselineSentimentAvg = n(input?.baselineSentimentAvg) ?? null;
  out.currentSentimentAvg = n(input?.currentSentimentAvg) ?? null;

  out.baselineEngagement = n(input?.baselineEngagement) ?? null;
  out.currentEngagement = n(input?.currentEngagement) ?? null;

  // Revenue v1
  out.baselineNetRevenueCents14d =
    n(input?.baselineNetRevenueCents14d) ??
    n(input?.baselineNetRevenueCentsPer14d) ?? // tolerate naming drift
    null;

  out.currentNetRevenueCents14d =
    n(input?.currentNetRevenueCents14d) ??
    n(input?.currentNetRevenueCentsPer14d) ??
    null;

  out.baselineRefundRate = n(input?.baselineRefundRate) ?? null;
  out.currentRefundRate = n(input?.currentRefundRate) ?? null;

  return out;
}

function hasRevenueSignal(x: ComputeInput) {
  return (
    (typeof x.currentNetRevenueCents14d === "number" && x.currentNetRevenueCents14d > 0) ||
    typeof x.currentRefundRate === "number"
  );
}

/**
 * Public, stable API.
 * Everything else in the app should call this (not individual engines).
 */
export function computeDrift(input: any): DriftResult {
  const norm = normalizeInput(input);

  if (hasRevenueSignal(norm)) {
    return computeRevenueV1({
      baselineNetRevenueCents14d: norm.baselineNetRevenueCents14d,
      currentNetRevenueCents14d: norm.currentNetRevenueCents14d,
      baselineRefundRate: norm.baselineRefundRate,
      currentRefundRate: norm.currentRefundRate,
    });
  }

  return computeLegacyV1({
    baselineReviewCountPer14d: norm.baselineReviewCountPer14d,
    currentReviewCount14d: norm.currentReviewCount14d,
    baselineSentimentAvg: norm.baselineSentimentAvg,
    currentSentimentAvg: norm.currentSentimentAvg,
    baselineEngagement: norm.baselineEngagement,
    currentEngagement: norm.currentEngagement,
  });
}

/**
 * Stable UI helper: ALWAYS returns {label, bullets[]} (never an array, never missing bullets).
 */
export function projectRisk(drift: DriftResult | any): RiskResult {
  const status = (drift?.status ?? null) as DriftStatus | null;
  const engine = drift?.meta?.engine as string | null;

  // Revenue engine: make bullets executive + predictable
  if (engine === "revenue_v1") {
    const deltaPct = drift?.meta?.revenue?.deltaPct;
    const refundDelta = drift?.meta?.refunds?.delta;

    const bullets: string[] = [];
    if (typeof deltaPct === "number") {
      const pct = Math.round(deltaPct * 100);
      bullets.push(`Revenue velocity is ${pct}% vs baseline (14d).`);
    }
    if (typeof refundDelta === "number") {
      const pct = Math.round(refundDelta * 100);
      if (pct !== 0) bullets.push(`Refund rate changed by ${pct}% vs baseline.`);
    }

    const label: RiskLabel =
      status === "attention" ? "High" : status === "softening" ? "Moderate" : "Low";

    if (!bullets.length) bullets.push("Not enough revenue history yet to project risk.");

    return { label, bullets };
  }

  // Legacy fallback: simple hit count
  const reviewDrop = Number(drift?.meta?.reviewDrop ?? 0);
  const engagementDrop = Number(drift?.meta?.engagementDrop ?? 0);
  const sentimentDelta = Number(drift?.meta?.sentimentDelta ?? 0);

  const hit =
    (reviewDrop >= 0.3 ? 1 : 0) +
    (engagementDrop >= 0.3 ? 1 : 0) +
    (sentimentDelta <= -0.5 ? 1 : 0);

  const label: RiskLabel = hit >= 2 ? "High" : hit === 1 ? "Moderate" : "Low";

  const bullets: string[] = [];
  if (reviewDrop >= 0.3) bullets.push("Customer review momentum is down meaningfully.");
  if (engagementDrop >= 0.3) bullets.push("Customer engagement is down meaningfully.");
  if (sentimentDelta <= -0.5) bullets.push("Customer sentiment is dropping sharply.");
  if (!bullets.length) bullets.push("No major risk signals detected in the current window.");

  return { label, bullets };
}

/**
 * Stable money helper.
 * Inputs are ALWAYS cents to avoid float mistakes.
 */
export function estimateRevenueImpact(args: {
  monthlyRevenueCents: number | null | undefined;
  drift: DriftResult | any;
}): RiskProjection {
  const monthlyRevenueCents = args.monthlyRevenueCents ?? null;

  if (!monthlyRevenueCents || monthlyRevenueCents <= 0) {
    return { lowCents: 0, highCents: 0, estimatedImpactCents: 0, label: "Low" };
  }

  const { label } = projectRisk(args.drift);

  // Conservative bands (v1): 30-day downside estimate
  const band =
    label === "High"
      ? { low: 0.08, high: 0.18 }
      : label === "Moderate"
      ? { low: 0.03, high: 0.08 }
      : { low: 0.0, high: 0.03 };

  const lowCents = Math.round(monthlyRevenueCents * band.low);
  const highCents = Math.round(monthlyRevenueCents * band.high);

  return {
    label,
    lowCents,
    highCents,
    estimatedImpactCents: Math.round((lowCents + highCents) / 2),
  };
}