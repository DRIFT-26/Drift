import UpgradeButton from "../UpgradeButton";
import SendTestSummaryButton from "./SendTestSummaryButton";
import { estimateRevenueImpact, projectRisk } from "@/lib/drift/compute";
import { headers } from "next/headers";

export const runtime = "nodejs";

type DriftStatus = "stable" | "watch" | "softening" | "attention";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function formatMoney(cents: number) {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function safeBaseUrl() {
  // Next 16: headers() can be async (returns Promise<ReadonlyHeaders>)
  const h = await headers();

  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (!host) return "https://drift-app-indol.vercel.app";
  return `${proto}://${host}`;
}

async function getAlertsPayload(businessId: string) {
  const base = await safeBaseUrl();

  const res = await fetch(`${base}/api/alerts?business_id=${encodeURIComponent(businessId)}`, {
    // keep fresh so the UI updates as you re-run jobs
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) {
    const msg = json?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return json as {
    ok: true;
    business: {
      id: string;
      name: string;
      is_paid: boolean;
      alert_email: string | null;
      timezone: string | null;
      last_drift: any | null;
      last_drift_at: string | null;
      monthly_revenue?: number | null; // dollars (legacy)
      monthly_revenue_cents?: number | null; // cents (new)
    };
    alerts: Array<{
      id: string;
      status: DriftStatus;
      reasons: Array<{ code: string; detail: string; delta?: number }>;
      window_start: string | null;
      window_end: string | null;
      created_at: string;
      meta: any | null;
    }>;
  };
}

function statusPill(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#111827",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  };

  if (s === "stable") return <span style={{ ...style, borderColor: "#d1fae5", background: "#ecfdf5", color: "#065f46" }}>Stable</span>;
  if (s === "softening") return <span style={{ ...style, borderColor: "#ffedd5", background: "#fff7ed", color: "#9a3412" }}>Softening</span>;
  if (s === "watch") return <span style={{ ...style, borderColor: "#dbeafe", background: "#eff6ff", color: "#1d4ed8" }}>Watch</span>;
  if (s === "attention") return <span style={{ ...style, borderColor: "#fee2e2", background: "#fef2f2", color: "#991b1b" }}>Attention</span>;

  return <span style={style}>Unknown</span>;
}

export default async function BusinessAlertsPage(props: { params: { businessId?: string } }) {
  const businessId = props?.params?.businessId?.trim() ?? "";

  if (!businessId) {
    return (
      <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.4 }}>Alerts</h1>
        <div style={{ marginTop: 12, padding: 14, border: "1px solid #eee", borderRadius: 12 }}>
          Missing businessId in route params.
        </div>
      </div>
    );
  }

  if (!isUuid(businessId)) {
    return (
      <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.4 }}>Alerts</h1>
        <div style={{ marginTop: 12, padding: 14, border: "1px solid #eee", borderRadius: 12 }}>
          Invalid businessId: <code>{businessId}</code>
        </div>
      </div>
    );
  }

  let payload: Awaited<ReturnType<typeof getAlertsPayload>>;
  try {
    payload = await getAlertsPayload(businessId);
  } catch (e: any) {
    return (
      <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.4 }}>Alerts</h1>
        <div style={{ marginTop: 12, padding: 14, border: "1px solid #eee", borderRadius: 12 }}>
          Failed to load business: {e?.message ?? String(e)}
        </div>
      </div>
    );
  }

  const biz = payload.business;
  const alerts = payload.alerts ?? [];

  const lastDrift = biz.last_drift ?? null;
  const engine = lastDrift?.meta?.engine ?? null;
  const direction = lastDrift?.meta?.direction ?? null;
  const score = typeof lastDrift?.meta?.mriScore === "number" ? lastDrift.meta.mriScore : null;
  const status = (lastDrift?.status ?? null) as DriftStatus | null;

  // Normalize monthly revenue -> cents (support legacy "monthly_revenue" dollars)
  const monthlyRevenueCents =
    typeof (biz as any)?.monthly_revenue_cents === "number"
      ? (biz as any).monthly_revenue_cents
      : typeof (biz as any)?.monthly_revenue === "number"
        ? Math.round((biz as any).monthly_revenue * 100)
        : null;

  const driftLike = {
    status,
    mriScore: score,
    engine,
    direction,
    // revenue v1 optional fields (safe if missing)
    reviewDrop: lastDrift?.meta?.reviewDrop ?? null,
    engagementDrop: lastDrift?.meta?.engagementDrop ?? null,
    sentimentDelta: lastDrift?.meta?.sentimentDelta ?? null,
    revenue: lastDrift?.meta?.revenue ?? null,
    refunds: lastDrift?.meta?.refunds ?? null,
  };

  const risk = projectRisk(driftLike as any);
  const impact = estimateRevenueImpact({
    monthlyRevenueCents,
    drift: driftLike as any,
  });

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700, letterSpacing: 0.2, textTransform: "uppercase" }}>
            DRIFT • Executive Monitor
          </div>

          <h1 style={{ marginTop: 6, fontSize: 26, fontWeight: 950, letterSpacing: -0.6, color: "#101828" }}>
            {biz.name ?? "Business"}
          </h1>

          <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {statusPill(status)}
            {engine ? (
              <span style={{ fontSize: 12, fontWeight: 800, color: "#344054" }}>
                Engine: <span style={{ color: "#101828" }}>{engine}</span>
              </span>
            ) : null}
            {direction ? (
              <span style={{ fontSize: 12, fontWeight: 800, color: "#344054" }}>
                Direction: <span style={{ color: "#101828" }}>{direction}</span>
              </span>
            ) : null}
            {typeof score === "number" ? (
              <span style={{ fontSize: 12, fontWeight: 800, color: "#344054" }}>
                RMI: <span style={{ color: "#101828" }}>{score}</span>
              </span>
            ) : null}
          </div>

          <div style={{ marginTop: 6, fontSize: 12, color: "#667085" }}>
            Last updated: {biz.last_drift_at ? new Date(biz.last_drift_at).toLocaleString() : "—"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SendTestSummaryButton businessId={businessId} />
          {!biz.is_paid ? <UpgradeButton businessId={businessId} /> : null}
        </div>
      </div>

      {/* Executive Status Card */}
      <div
        style={{
          marginTop: 18,
          padding: 16,
          borderRadius: 16,
          border: "1px solid #eaecf0",
          background: "linear-gradient(180deg, #ffffff 0%, #fbfbff 100%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#101828" }}>Revenue Momentum</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#667085" }}>Risk: {risk.label}</div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 12, color: "#667085", fontWeight: 800 }}>Estimated 30-day impact</div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 950, letterSpacing: -0.6, color: "#101828" }}>
              {formatMoney(impact.estimatedImpactCents)}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
              Range: {formatMoney(impact.lowCents)} – {formatMoney(impact.highCents)}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 12, color: "#667085", fontWeight: 800 }}>Top drivers</div>

            {Array.isArray(lastDrift?.reasons) && lastDrift.reasons.length ? (
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#101828" }}>
                {lastDrift.reasons.slice(0, 3).map((r: any, i: number) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 800 }}>{r?.detail ?? r?.code ?? "Signal"}</span>
                    {typeof r?.delta === "number" ? (
                      <span style={{ color: "#667085", marginLeft: 8, fontSize: 12 }}>(Δ {r.delta.toFixed(2)})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ marginTop: 10, fontSize: 13, color: "#667085" }}>
                No negative drivers detected in the current window.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alerts Timeline */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#101828", marginBottom: 10 }}>Alert history</div>

        {alerts.length === 0 ? (
          <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 12, color: "#667085" }}>
            No alerts yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {alerts.map((a) => (
              <div key={a.id} style={{ padding: 14, borderRadius: 14, border: "1px solid #eaecf0", background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {statusPill(a.status)}
                    <div style={{ fontSize: 12, color: "#667085" }}>
                      Window: {a.window_start ?? "—"} → {a.window_end ?? "—"}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#667085" }}>{new Date(a.created_at).toLocaleString()}</div>
                </div>

                {Array.isArray(a.reasons) && a.reasons.length ? (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                    {a.reasons.slice(0, 5).map((r, i) => (
                      <li key={i} style={{ marginBottom: 6, color: "#101828" }}>
                        <span style={{ fontWeight: 800 }}>{r.detail}</span>{" "}
                        <span style={{ color: "#667085", fontSize: 12 }}>{r.code}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 13, color: "#667085" }}>No reasons recorded.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}