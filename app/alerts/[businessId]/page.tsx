// app/alerts/[businessId]/page.tsx
import React from "react";

export const runtime = "nodejs";

type DriftReason = { code: string; detail: string; delta?: number };
type RevenueMeta = {
  engine?: string;
  direction?: "up" | "flat" | "down" | string;
  mriScore?: number;
  revenue?: {
    baselineNetRevenueCents14d?: number;
    currentNetRevenueCents14d?: number;
    deltaPct?: number;
  };
  refunds?: {
    baselineRefundRate?: number;
    currentRefundRate?: number;
    delta?: number;
  };
};

type Business = {
  id: string;
  name: string;
  is_paid?: boolean | null;
  alert_email?: string | null;
  timezone?: string | null;
  monthly_revenue?: number | null; // your api/alerts currently returns monthly_revenue (dollars)
  last_drift?: {
    status?: string | null;
    reasons?: DriftReason[] | null;
    meta?: RevenueMeta | any;
  } | null;
  last_drift_at?: string | null;
};

type AlertRow = {
  id: string;
  business_id: string;
  status: string;
  reasons: DriftReason[] | null;
  window_start: string | null;
  window_end: string | null;
  created_at: string;
  meta: any | null;
};

type AlertsApiResponse = {
  ok: boolean;
  error?: string;
  business?: Business;
  alerts?: AlertRow[];
};

function formatMoneyCents(cents: number) {
  const v = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v / 100);
}

function formatPct(x: number) {
  const v = Number.isFinite(x) ? x : 0;
  return `${Math.round(v * 100)}%`;
}

function directionLabel(d?: string) {
  if (d === "up") return "Up";
  if (d === "down") return "Down";
  return "Flat";
}

function statusPill(status?: string | null) {
  const s = (status ?? "unknown").toLowerCase();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    stable: { bg: "#ECFDF3", fg: "#027A48", label: "Stable" },
    watch: { bg: "#FFFAEB", fg: "#B54708", label: "Watch" },
    softening: { bg: "#FFFAEB", fg: "#B54708", label: "Softening" },
    attention: { bg: "#FEF3F2", fg: "#B42318", label: "Attention" },
    unknown: { bg: "#F2F4F7", fg: "#344054", label: "Unknown" },
  };
  return map[s] ?? map.unknown;
}

export default async function BusinessAlertsPage(props: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await props.params;

  if (!businessId) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2 style={{ margin: 0 }}>Alerts</h2>
        <p style={{ color: "#667085" }}>Missing businessId in route params.</p>
      </div>
    );
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || "https://drift-app-indol.vercel.app";
  const res = await fetch(`${base}/api/alerts?business_id=${encodeURIComponent(businessId)}`, {
    // keep it dynamic so it always reflects latest run
    cache: "no-store",
  });

  let data: AlertsApiResponse | null = null;
  try {
    data = (await res.json()) as AlertsApiResponse;
  } catch {
    data = null;
  }

  if (!res.ok || !data?.ok || !data.business) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2 style={{ margin: 0 }}>Alerts</h2>
        <p style={{ color: "#B42318" }}>
          Failed to load business: {data?.error ?? `HTTP ${res.status}`}
        </p>
      </div>
    );
  }

  const business = data.business;
  const last = business.last_drift ?? null;
  const engine = (last?.meta?.engine ?? "").toString();
  const reasons = (last?.reasons ?? []) as DriftReason[];

  const warmup = reasons.some((r) => r.code === "BASELINE_WARMUP");
  const pill = statusPill(last?.status ?? null);

  // =========================
  // ✅ Revenue v1 UI (clean)
  // =========================
  if (engine === "revenue_v1") {
    const meta = (last?.meta ?? {}) as RevenueMeta;

    const mri = meta.mriScore ?? 0;
    const dir = meta.direction ?? "flat";

    const currentNet = meta.revenue?.currentNetRevenueCents14d ?? 0;
    const baselineNet = meta.revenue?.baselineNetRevenueCents14d ?? 0;
    const deltaPct = meta.revenue?.deltaPct ?? 0;

    const currentRefundRate = meta.refunds?.currentRefundRate ?? 0;
    const baselineRefundRate = meta.refunds?.baselineRefundRate ?? 0;

    return (
      <div style={{ padding: 24, fontFamily: "system-ui", background: "#F8FAFC", minHeight: "100vh" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.5, color: "#101828" }}>{business.name}</h1>
              <div style={{ marginTop: 6, color: "#667085", fontSize: 13 }}>
                Executive Revenue Monitor • Engine: <b>{engine}</b>
              </div>
            </div>

            <div
              style={{
                background: pill.bg,
                color: pill.fg,
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                alignSelf: "flex-start",
              }}
            >
              {pill.label}
            </div>
          </div>

          {warmup && (
            <div
              style={{
                marginTop: 14,
                background: "#FFFAEB",
                border: "1px solid #FEC84B",
                color: "#7A2E0E",
                padding: 12,
                borderRadius: 12,
                fontSize: 13,
              }}
            >
              <b>Baseline warmup:</b> building comparisons as more history accumulates. Current 14-day numbers are valid;
              baseline deltas may be conservative until you have more activity.
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              background: "#FFFFFF",
              border: "1px solid #EAECF0",
              borderRadius: 16,
              padding: 18,
              boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ minWidth: 240 }}>
                <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>RMI SCORE</div>
                <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: -1, color: "#101828" }}>{mri}</div>
                <div style={{ fontSize: 13, color: "#667085" }}>Direction: <b>{directionLabel(dir)}</b></div>
              </div>

              <div style={{ minWidth: 260 }}>
                <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>NET REVENUE (LAST 14 DAYS)</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#101828" }}>{formatMoneyCents(currentNet)}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
                  Baseline (14d): <b>{formatMoneyCents(baselineNet)}</b> • Δ: <b>{formatPct(deltaPct)}</b>
                </div>
              </div>

              <div style={{ minWidth: 260 }}>
                <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>REFUND RATE (LAST 14 DAYS)</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#101828" }}>{formatPct(currentRefundRate)}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
                  Baseline: <b>{formatPct(baselineRefundRate)}</b>
                </div>
              </div>
            </div>

            {reasons?.length ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: "#667085", fontWeight: 800, letterSpacing: 0.2 }}>
                  DRIVERS
                </div>
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#101828" }}>
                  {reasons.map((r, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>
                      <b>{r.code}</b> — {r.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 14, color: "#667085", fontSize: 12 }}>
            Tip: run Stripe ingest daily + daily compute to keep this current.
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // Legacy fallback (minimal)
  // =========================
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0, fontSize: 26, color: "#101828" }}>{business.name}</h1>
      <p style={{ color: "#667085" }}>
        Engine: <b>{engine || "legacy"}</b>
      </p>

      <div style={{ marginTop: 12, background: "#FFF", border: "1px solid #EAECF0", borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 800, color: "#101828" }}>Latest status</div>
        <div style={{ marginTop: 6, color: "#667085" }}>{pill.label}</div>

        {reasons?.length ? (
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#101828" }}>
            {reasons.map((r, i) => (
              <li key={i}>
                <b>{r.code}</b> — {r.detail}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ marginTop: 10, color: "#667085" }}>No drivers.</div>
        )}
      </div>
    </div>
  );
}