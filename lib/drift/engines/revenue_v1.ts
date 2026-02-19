// lib/drift/engines/revenue_v1.ts
import type { DriftDirection, DriftReason, DriftResult, DriftStatus, RevenueComputeInput } from "../types";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function pctDelta(current: number, baseline: number) {
  if (!baseline || baseline <= 0) return current > 0 ? 1 : 0;
  return (current - baseline) / baseline; // e.g. -0.22
}

export function computeRevenueV1(input: RevenueComputeInput): DriftResult {
  const baselineNet = Number(input.baselineNetRevenueCents14d ?? 0);
  const currentNet = Number(input.currentNetRevenueCents14d ?? 0);

  const baselineRefundRate = clamp(Number(input.baselineRefundRate ?? 0), 0, 1);
  const currentRefundRate = clamp(Number(input.currentRefundRate ?? 0), 0, 1);

  const deltaPct = pctDelta(currentNet, baselineNet);
  const refundDelta = currentRefundRate - baselineRefundRate;

  const reasons: DriftReason[] = [];

  // Revenue velocity drop
  if (deltaPct <= -0.25) {
    reasons.push({
      code: "REV_VELOCITY_DROP_25",
      detail: "Revenue velocity down 25%+ vs baseline",
      delta: deltaPct,
    });
  } else if (deltaPct <= -0.1) {
    reasons.push({
      code: "REV_VELOCITY_DROP_10",
      detail: "Revenue velocity down 10%+ vs baseline",
      delta: deltaPct,
    });
  }

  // Refund rate rising
  if (refundDelta >= 0.05) {
    reasons.push({
      code: "REFUND_RATE_UP_5",
      detail: "Refund rate up 5%+ vs baseline",
      delta: refundDelta,
    });
  } else if (refundDelta >= 0.02) {
    reasons.push({
      code: "REFUND_RATE_UP_2",
      detail: "Refund rate up 2%+ vs baseline",
      delta: refundDelta,
    });
  }

  // Direction
  const direction: DriftDirection =
    deltaPct > 0.05 ? "up" : deltaPct < -0.05 ? "down" : "flat";

  // Status (simple + executive)
  let status: DriftStatus = "stable";
  if (deltaPct <= -0.25 || refundDelta >= 0.05) status = "attention";
  else if (deltaPct <= -0.1 || refundDelta >= 0.02) status = "softening";

  // MRI score (0..100) — higher is healthier
  // penalties: revenue drop up to 70, refunds up to 30
  const revenuePenalty =
    deltaPct < 0 ? Math.round(clamp(-deltaPct / 0.35, 0, 1) * 70) : 0;
  const refundPenalty =
    refundDelta > 0 ? Math.round(clamp(refundDelta / 0.08, 0, 1) * 30) : 0;

  const mriRaw = 100 - (revenuePenalty + refundPenalty);
  const mriScore = clamp(Math.round(mriRaw), 0, 100);

  return {
    status,
    reasons,
    meta: {
      engine: "revenue_v1",
      direction,
      mriScore,
      mriRaw,
      mriPrev: null,
      revenue: {
        baselineNetRevenueCents14d: baselineNet,
        currentNetRevenueCents14d: currentNet,
        deltaPct,
      },
      refunds: {
        baselineRefundRate,
        currentRefundRate,
        delta: refundDelta,
      },
      components: {
        revenue: revenuePenalty,
        refunds: refundPenalty,
      },
    },
  };
}