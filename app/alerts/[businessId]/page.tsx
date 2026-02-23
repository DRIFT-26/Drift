// app/alerts/[businessId]/page.tsx
import Link from "next/link";

type DriftStatus = "stable" | "watch" | "softening" | "attention";
type RiskLabel = "Low" | "Moderate" | "High";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNum(v: any, fallback: number | null = 0) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? (n as number) : fallback;
}

function formatMoney(cents: number | null | undefined) {
  if (typeof cents !== "number") return "—";
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatPct(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function statusTone(status: DriftStatus) {
  switch (status) {
    case "attention":
      return { bg: "#FEF3F2", fg: "#B42318", border: "#FECDCA" };
    case "softening":
      return { bg: "#FFFAEB", fg: "#B54708", border: "#FEDF89" };
    case "watch":
      return { bg: "#F0F9FF", fg: "#026AA2", border: "#B9E6FE" };
    case "stable":
    default:
      return { bg: "#ECFDF3", fg: "#027A48", border: "#ABEFC6" };
  }
}

function normalizeStatus(raw: any): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
  return "stable";
}

function normalizeDirection(raw: any): "up" | "down" | "flat" | null {
  const s = String(raw ?? "").toLowerCase();
  if (s === "up") return "up";
  if (s === "down") return "down";
  if (s === "flat") return "flat";
  return null;
}

function projectRiskLabel(status: DriftStatus, score: number | null): RiskLabel {
  if (status === "attention") return "High";
  if (status === "softening" || status === "watch") return "Moderate";
  if (typeof score === "number" && score < 80) return "Moderate";
  return "Low";
}

function isUuidLike(v: string) {
  // Good enough for UI safety (prevents obvious "undefined" / junk)
  return /^[0-9a-fA-F-]{32,36}$/.test(v);
}

export default async function BusinessAlertsPage({
  params,
}: {
  // Next 16 can type params as Promise in some setups; this keeps it compatible.
  params: Promise<{ businessId?: string }> | { businessId?: string };
}) {
  const resolved = (await Promise.resolve(params)) as { businessId?: string };
  const businessId = resolved?.businessId;

  if (!businessId || businessId === "undefined" || !isUuidLike(businessId)) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>
          Missing businessId in route params.
        </div>
        <div style={{ marginTop: 10, color: "#667085" }}>
          Try: <code>/alerts/&lt;uuid&gt;</code>
        </div>
      </div>
    );
  }

  // ✅ IMPORTANT: Use a RELATIVE URL so Next routes internally (avoids 401 / HTML / token issues)
  const apiPath = `/api/alerts?business_id=${encodeURIComponent(businessId)}`;

  let payload: any = null;
  let httpStatus: number | null = null;
  let firstBytes: string | null = null;

  try {
    const res = await fetch(apiPath, { cache: "no-store" });
    httpStatus = res.status;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const t = await res.text();
      firstBytes = t.slice(0, 120);
      payload = {
        ok: false,
        error: `API did not return JSON (status ${res.status}). First bytes: ${firstBytes}`,
      };
    } else {
      payload = await res.json();
    }
  } catch (e: any) {
    payload = { ok: false, error: e?.message ?? String(e) };
  }

  if (!payload?.ok) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>
          Failed to load business: {payload?.error ?? "unknown_error"}
        </div>
        <div style={{ marginTop: 10, color: "#667085", fontSize: 12 }}>
          {httpStatus != null ? (
            <>
              HTTP status: <code>{httpStatus}</code>
            </>
          ) : null}
        </div>
        <div style={{ marginTop: 10 }}>
          <Link href="/alerts" style={{ color: "#175CD3" }}>
            ← Back to Alerts
          </Link>
        </div>
      </div>
    );
  }

  const business = payload.business;
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];

  // ---- Hybrid drift fallback chain (newest first) ----
  const lastDrift = business?.last_drift ?? null;
  const latestAlert = alerts?.[0] ?? null;

  const driftMeta = (lastDrift?.meta ?? latestAlert?.meta ?? {}) as any;
  const driftStatus = normalizeStatus(lastDrift?.status ?? latestAlert?.status ?? "stable");
  const driftReasons = (lastDrift?.reasons ?? latestAlert?.reasons ?? []) as any[];

  // engine + direction
  const engine = String(driftMeta?.engine ?? "revenue_v1");
  const direction = normalizeDirection(driftMeta?.direction);

  const mriScore = typeof driftMeta?.mriScore === "number" ? driftMeta.mriScore : null;

  const revenueMeta = driftMeta?.revenue ?? {};
  const refundsMeta = driftMeta?.refunds ?? {};

  // Prefer revenue_v1 fields, fallback to tolerated legacy names
  const baselineNet14dRaw =
    revenueMeta?.baselineNetRevenueCents14d ?? revenueMeta?.baselineNetRevenueCentsPer14d;
  const baselineNet14d =
    typeof baselineNet14dRaw === "number" ? baselineNet14dRaw : toNum(baselineNet14dRaw, null);

  const currentNet14dRaw =
    revenueMeta?.currentNetRevenueCents14d ?? revenueMeta?.currentNetRevenueCentsPer14d;
  const currentNet14d =
    typeof currentNet14dRaw === "number" ? currentNet14dRaw : toNum(currentNet14dRaw, null);

  const deltaPct = typeof revenueMeta?.deltaPct === "number" ? revenueMeta.deltaPct : null;

  const refundRateCurrent =
    typeof refundsMeta?.currentRefundRate === "number"
      ? refundsMeta.currentRefundRate
      : typeof refundsMeta?.refund_rate === "number"
      ? refundsMeta.refund_rate
      : null;

  const refundRateBaseline =
    typeof refundsMeta?.baselineRefundRate === "number" ? refundsMeta.baselineRefundRate : null;

  // Monthly revenue (API sometimes returns monthly_revenue dollars OR monthly_revenue_cents)
  const monthlyRevenueCents =
    typeof business?.monthly_revenue_cents === "number"
      ? business.monthly_revenue_cents
      : typeof business?.monthly_revenue === "number"
      ? Math.round(business.monthly_revenue * 100)
      : null;

  const tone = statusTone(driftStatus);
  const riskLabel = projectRiskLabel(driftStatus, mriScore);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", background: "#F8FAFC", minHeight: "100vh" }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: "#667085", letterSpacing: 0.4 }}>
            DRIFT / EXECUTIVE SIGNAL
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 900, color: "#101828" }}>
            {business?.name ?? "Business"}
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Engine: <span style={{ color: "#101828", fontWeight: 700 }}>{engine}</span>
            {direction ? (
              <>
                {" · "}Direction:{" "}
                <span style={{ color: "#101828", fontWeight: 700 }}>{direction}</span>
              </>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              background: tone.bg,
              color: tone.fg,
              border: `1px solid ${tone.border}`,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 0.2,
            }}
          >
            {driftStatus.toUpperCase()}
          </div>

          <div
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              background: "#FFFFFF",
              border: "1px solid #EAECF0",
              boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
              fontSize: 13,
              color: "#101828",
              fontWeight: 800,
            }}
            title="Risk projection label"
          >
            Risk: {riskLabel}
          </div>

          <Link href="/alerts" style={{ color: "#175CD3", fontWeight: 700, fontSize: 13 }}>
            Back
          </Link>
        </div>
      </div>

      {/* KPI grid */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 12,
        }}
      >
        <div
          style={{
            gridColumn: "span 4",
            background: "#fff",
            border: "1px solid #EAECF0",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
          }}
        >
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>MRI SCORE</div>
          <div style={{ marginTop: 8, fontSize: 34, fontWeight: 950, color: "#101828" }}>
            {typeof mriScore === "number" ? clamp(mriScore, 0, 100) : "—"}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Executive stability index (0–100)
          </div>
        </div>

        <div
          style={{
            gridColumn: "span 4",
            background: "#fff",
            border: "1px solid #EAECF0",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
          }}
        >
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>NET REVENUE (14D)</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: "#101828" }}>
            {formatMoney(currentNet14d)}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Baseline: {formatMoney(baselineNet14d)}{" "}
            {typeof deltaPct === "number" ? (
              <>
                {" · "}Δ {(deltaPct * 100).toFixed(0)}%
              </>
            ) : null}
          </div>
        </div>

        <div
          style={{
            gridColumn: "span 4",
            background: "#fff",
            border: "1px solid #EAECF0",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
          }}
        >
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>REFUND RATE (14D)</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: "#101828" }}>
            {formatPct(refundRateCurrent)}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Baseline: {formatPct(refundRateBaseline)}
          </div>
        </div>

        <div
          style={{
            gridColumn: "span 12",
            background: "#fff",
            border: "1px solid #EAECF0",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>WHY THIS STATUS</div>
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 900, color: "#101828" }}>
                {driftReasons?.length ? "Key signals detected" : "No negative signals detected"}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
                CEO readable — short, specific, actionable.
              </div>
            </div>

            <div
              style={{
                minWidth: 260,
                background: "#F9FAFB",
                border: "1px solid #EAECF0",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>CONTEXT</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#101828", fontWeight: 800 }}>
                Monthly Revenue (manual)
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#667085" }}>
                {formatMoney(monthlyRevenueCents)}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#667085" }}>
                Used for impact estimates later (optional).
              </div>
            </div>
          </div>

          {driftReasons?.length ? (
            <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: "#101828" }}>
              {driftReasons.map((r: any, i: number) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <span style={{ fontWeight: 900 }}>{String(r?.code ?? "SIGNAL")}</span>
                  <span style={{ color: "#667085" }}> — </span>
                  <span>{String(r?.detail ?? "—")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ marginTop: 14, color: "#667085", fontSize: 13 }}>
              Drift currently reads as stable. When signals appear, you’ll see them here.
            </div>
          )}

          <div style={{ marginTop: 14, borderTop: "1px solid #EAECF0", paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: "#667085" }}>
              Business ID: <code>{businessId}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}