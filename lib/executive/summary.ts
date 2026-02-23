// lib/executive/summary.ts
export type DriftStatus = "stable" | "watch" | "softening" | "attention";
export type EmailStatus = "stable" | "softening" | "attention"; // templates often don’t include "watch"
export type Confidence = "low" | "medium" | "high";

export function capReasons(reasons: any[], n = 3) {
  return Array.isArray(reasons) ? reasons.slice(0, n) : [];
}

export function normalizeStatus(raw: any): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
  return "stable";
}

export function statusForEmail(status: DriftStatus): EmailStatus {
  // “watch” becomes “softening” for emails/templates
  if (status === "watch") return "softening";
  return status;
}

export function formatPct(v: number | null | undefined) {
  if (typeof v !== "number") return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function formatMoneyCents(cents: number | null | undefined) {
  if (typeof cents !== "number") return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function computeConfidence(args: { reasons: any[]; meta: any }): Confidence {
  const { reasons, meta } = args;

  // conservative confidence: warmup => low
  const warmup = (reasons ?? []).some((r: any) => String(r?.code ?? "") === "BASELINE_WARMUP");
  if (warmup) return "low";

  const hasBaseline =
    typeof meta?.refunds?.baselineRefundRate === "number" ||
    typeof meta?.revenue?.baselineNetRevenueCents14d === "number";

  const hasCurrent =
    typeof meta?.refunds?.currentRefundRate === "number" ||
    typeof meta?.revenue?.currentNetRevenueCents14d === "number";

  if (hasBaseline && hasCurrent) return "medium";
  return "low";
}

export function executiveSummary(args: {
  businessName: string;
  businessId: string;
  status: DriftStatus;
  reasons: any[];
  meta: any;
  monthlyRevenueCents?: number | null;
}) {
  const { businessName, businessId, status, reasons, meta, monthlyRevenueCents } = args;

  const refundCur = meta?.refunds?.currentRefundRate ?? null;
  const refundBase = meta?.refunds?.baselineRefundRate ?? null;

  const netCur = meta?.revenue?.currentNetRevenueCents14d ?? null;
  const netBase = meta?.revenue?.baselineNetRevenueCents14d ?? null;
  const deltaPct = meta?.revenue?.deltaPct ?? null;

  const confidence = computeConfidence({ reasons, meta });

  const topReason = reasons?.[0]?.detail || reasons?.[0]?.code;

  const headline =
    status === "stable"
      ? "No material risk signals detected."
      : typeof topReason === "string" && topReason.length
      ? topReason
      : "Material change detected vs baseline.";

  // conservative impact estimate (optional)
  let estMonthlyCents: number | null = null;
  if (typeof monthlyRevenueCents === "number" && typeof deltaPct === "number") {
    estMonthlyCents = Math.round(monthlyRevenueCents * deltaPct);
  }

  const drivers: Array<{ label: string; value: string; baseline: string; delta: string }> = [];

  if (typeof refundCur === "number") {
    const d = typeof refundBase === "number" ? refundCur - refundBase : null;
    drivers.push({
      label: "Refund rate (14d)",
      value: formatPct(refundCur),
      baseline: formatPct(refundBase),
      delta: d == null ? "—" : `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`,
    });
  }

  if (typeof netCur === "number") {
    drivers.push({
      label: "Net revenue (14d)",
      value: formatMoneyCents(netCur),
      baseline: formatMoneyCents(netBase),
      delta: typeof deltaPct === "number" ? `${(deltaPct * 100).toFixed(0)}%` : "—",
    });
  }

  const nextSteps =
    status === "stable"
      ? ["No action needed. DRIFT will keep monitoring."]
      : reasons.some((r: any) => String(r?.code ?? "").includes("REFUND"))
      ? [
          "Review refunds/disputes in Stripe for the last 14 days and identify the top drivers.",
          "Check for recent policy, fulfillment, or product changes that could trigger refunds.",
          "Confirm there are no duplicate charges or payment flow issues.",
        ]
      : [
          "Review the last 14 days vs baseline and confirm the change is real (not a one-off).",
          "Look for a single driver (pricing, traffic, conversion, refunds) before taking action.",
          "If the signal persists for 2–3 days, treat as actionable.",
        ];

  return {
    businessName,
    businessId,
    status,
    confidence,
    headline,
    impact: { est_monthly: estMonthlyCents == null ? null : formatMoneyCents(estMonthlyCents) },
    drivers,
    nextSteps,
    detailsPath: `/alerts/${businessId}`,
  };
}