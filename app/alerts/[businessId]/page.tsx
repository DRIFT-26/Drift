// app/alerts/[businessId]/page.tsx

import UpgradeButton from "../UpgradeButton";
import SendTestSummaryButton from "./SendTestSummaryButton";
import { estimateRevenueImpact, projectRisk } from "@/lib/drift/compute";
import type { DriftStatus } from "@/lib/drift/compute";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PageProps = { params: { businessId: string } };

type AlertRow = {
  id: string;
  business_id: string;
  status: string | null;
  reasons: any[] | null;
  window_start: string | null;
  window_end: string | null;
  created_at: string;
  meta: any | null;
};

function asDriftStatus(v: any): DriftStatus | null {
  return v === "stable" || v === "watch" || v === "attention" ? v : null;
}

function formatMoney(cents: number) {
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function statusColor(s: DriftStatus | null) {
  if (s === "attention") return { bg: "#FEF3F2", fg: "#B42318", border: "#FDA29B", dot: "#F04438" };
  if (s === "softening") return { bg: "#FFFAEB", fg: "#B54708", border: "#FEC84B", dot: "#F79009" };
  return { bg: "#ECFDF3", fg: "#027A48", border: "#6CE9A6", dot: "#12B76A" };
}

function prettyStatus(s: DriftStatus | null) {
  if (s === "attention") return "Attention";
  if (s === "softening") return "Watch";
  return "Stable";
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

export default async function BusinessAlertsPage({ params }: PageProps) {
  const businessId = params.businessId;
  const supabase = supabaseAdmin();

  // Business
  const { data: biz, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,timezone,is_paid,alert_email,monthly_revenue,last_drift,last_drift_at")
    .eq("id", businessId)
    .maybeSingle();

  if (bErr) {
    return (
      <main style={{ padding: 22, maxWidth: 1120, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Alerts</h1>
        <div style={{ marginTop: 12, color: "#B42318" }}>Failed to load business: {bErr.message}</div>
      </main>
    );
  }

  if (!biz) {
    return (
      <main style={{ padding: 22, maxWidth: 1120, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Alerts</h1>
        <div style={{ marginTop: 12, color: "#475467" }}>Business not found.</div>
      </main>
    );
  }

  const isPaid = (biz as any).is_paid === true;
  const monthlyRevenue: number | null = (biz as any).monthly_revenue ?? null;

  // Alerts
  const { data: alertsRaw, error: aErr } = await supabase
    .from("alerts")
    .select("id,business_id,status,reasons,window_start,window_end,created_at,meta")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (aErr) {
    return (
      <main style={{ padding: 22, maxWidth: 1120, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{biz.name ?? "Business"}</h1>
        <div style={{ marginTop: 12, color: "#B42318" }}>Failed to load alerts: {aErr.message}</div>
      </main>
    );
  }

  const alerts = (alertsRaw ?? []) as AlertRow[];
  const latestAlert = alerts[0] ?? null;

  const latestStatus = asDriftStatus(latestAlert?.status);
  const colors = statusColor(latestStatus);

  // Drift-like meta (works whether meta is legacy (reviewDrop/etc) or MRI v1 later)
  const driftLike = {
    reviewDrop: latestAlert?.meta?.reviewDrop ?? null,
    engagementDrop: latestAlert?.meta?.engagementDrop ?? null,
    sentimentDelta: latestAlert?.meta?.sentimentDelta ?? null,
    mriScore: latestAlert?.meta?.mriScore ?? null,
    status: latestStatus,
  };

  const risk = projectRisk(driftLike);
  const impact = estimateRevenueImpact({ monthlyRevenue, drift: driftLike });

  // Sources
  const { data: sourcesRaw } = await supabase
    .from("sources")
    .select("id,type,is_connected,display_name,created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  const sources = sourcesRaw ?? [];

  return (
    <main style={{ padding: 22, maxWidth: 1120, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "#667085", letterSpacing: 0.6, textTransform: "uppercase" }}>
            Alerts
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: 28, letterSpacing: -0.6, color: "#101828" }}>
            {biz.name ?? businessId}
          </h1>

          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${colors.border}`,
                background: colors.bg,
                color: colors.fg,
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: colors.dot }} />
              {prettyStatus(latestStatus)}
            </span>

            <span style={{ fontSize: 13, color: "#667085" }}>
              Latest: {latestAlert ? fmtDate(latestAlert.created_at) : "—"}
            </span>

            <span style={{ fontSize: 13, color: "#667085" }}>
              Sources:{" "}
              <span style={{ color: "#101828", fontWeight: 700 }}>
                {(sources ?? []).filter((s: any) => s.is_connected).length}
              </span>
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SendTestSummaryButton businessId={businessId} />
          {!isPaid ? <UpgradeButton businessId={businessId} /> : null}
        </div>
      </div>

      {/* Top grid */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 12 }}>
        {/* Left: Latest alert details */}
        <div style={{ border: "1px solid #EAECF0", background: "#FFFFFF", borderRadius: 16, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <div style={{ fontWeight: 900, color: "#101828", letterSpacing: -0.2 }}>Latest Signal</div>
            <div style={{ fontSize: 12, color: "#667085" }}>
              Window: {latestAlert?.window_start ?? "—"} → {latestAlert?.window_end ?? "—"}
            </div>
          </div>

          {!latestAlert ? (
            <div style={{ marginTop: 10, color: "#475467" }}>No alerts yet.</div>
          ) : (
            <>
              <div style={{ marginTop: 10, color: "#475467", fontSize: 13 }}>
                DRIFT is watching for early momentum shifts. When signals cross thresholds, you’ll see it here.
              </div>

              {/* Reasons */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#667085", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Reasons
                </div>

                {latestAlert.reasons?.length ? (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#101828" }}>
                    {latestAlert.reasons.map((r: any, i: number) => (
                      <li key={i} style={{ marginBottom: 6 }}>
                        <span style={{ fontWeight: 800 }}>{r?.detail ?? r?.code ?? "Signal"}</span>
                        {typeof r?.delta === "number" ? (
                          <span style={{ color: "#667085" }}> — Δ {r.delta.toFixed(3)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ marginTop: 8, color: "#12B76A", fontWeight: 800 }}>
                    No significant risk detected.
                  </div>
                )}
              </div>

              {/* Projections */}
              <div style={{ marginTop: 12, borderTop: "1px solid #EAECF0", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 12, color: "#667085", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Projections
                  </div>
                  <div style={{ fontSize: 12, color: "#667085" }}>Next 30 days</div>
                </div>

                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid #EAECF0",
                      background: "#F9FAFB",
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#101828",
                    }}
                  >
                    {risk.label}
                  </span>
                  <span style={{ fontSize: 13, color: "#475467" }}>
                    {risk.label === "High"
                      ? "You’re exposed right now. Tighten the next 2 weeks."
                      : risk.label === "Moderate"
                        ? "Some drift. Fixing one lever can reverse this quickly."
                        : "Low risk. Keep doing what’s working."}
                  </span>
                </div>

                {risk.bullets?.length ? (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#101828" }}>
                    {risk.bullets.map((p: string, i: number) => (
                      <li key={i} style={{ marginBottom: 6 }}>
                        {p}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Right: Revenue impact */}
        <div style={{ border: "1px solid #EAECF0", background: "#FFFFFF", borderRadius: 16, padding: 14 }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: "#667085",
            }}
          >
            Estimated Revenue Impact
          </div>

          {!isPaid ? (
            <div style={{ marginTop: 8, fontSize: 13, color: "#475467" }}>
              Add monthly revenue to unlock revenue-at-risk projections.
            </div>
          ) : !monthlyRevenue ? (
            <div style={{ marginTop: 8, fontSize: 13, color: "#475467" }}>
              No monthly revenue set for this business yet.
            </div>
          ) : !impact || impact.highCents <= 0 ? (
            <div style={{ marginTop: 8, fontSize: 13, color: "#12B76A", fontWeight: 800 }}>
              No significant revenue risk detected.
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: -0.4, color: "#101828" }}>
                {formatMoney(impact.estimatedImpact)}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
                Range: {formatMoney(impact.lowCents)} – {formatMoney(impact.highCents)} (next 30 days)
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: "#475467" }}>
                Estimated impact based on the latest momentum signals and your monthly revenue.
              </div>
            </div>
          )}

          <div style={{ marginTop: 14, borderTop: "1px solid #EAECF0", paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: "#667085", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Monitoring
            </div>

            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {sources.length ? (
                sources.map((s: any) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: "1px solid #EAECF0",
                      background: "#F9FAFB",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 850, color: "#101828", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.display_name || s.type}
                      </div>
                      <div style={{ fontSize: 12, color: "#667085" }}>{String(s.type)}</div>
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: s.is_connected ? "#027A48" : "#B42318",
                        background: s.is_connected ? "#ECFDF3" : "#FEF3F2",
                        border: `1px solid ${s.is_connected ? "#6CE9A6" : "#FDA29B"}`,
                        padding: "5px 10px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.is_connected ? "Connected" : "Disconnected"}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: "#475467", fontSize: 13 }}>No sources yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Alert history */}
      <div style={{ marginTop: 14, border: "1px solid #EAECF0", background: "#FFFFFF", borderRadius: 16, padding: 14 }}>
        <div style={{ fontWeight: 900, color: "#101828", letterSpacing: -0.2 }}>Alert History</div>

        {!alerts.length ? (
          <div style={{ marginTop: 10, color: "#475467" }}>No alerts yet.</div>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {alerts.map((a) => {
              const s = asDriftStatus(a.status);
              const c = statusColor(s);
              return (
                <div
                  key={a.id}
                  style={{
                    border: "1px solid #EAECF0",
                    borderRadius: 14,
                    padding: 12,
                    background: "#FFFFFF",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: `1px solid ${c.border}`,
                          background: c.bg,
                          color: c.fg,
                          fontWeight: 850,
                          fontSize: 12,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot }} />
                        {prettyStatus(s)}
                      </span>

                      <span style={{ fontSize: 13, color: "#667085" }}>{fmtDate(a.created_at)}</span>
                    </div>

                    <div style={{ fontSize: 12, color: "#667085" }}>
                      {a.window_start ?? "—"} → {a.window_end ?? "—"}
                    </div>
                  </div>

                  {a.reasons?.length ? (
                    <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#101828" }}>
                      {a.reasons.map((r: any, i: number) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          <span style={{ fontWeight: 800 }}>{r?.detail ?? r?.code ?? "Signal"}</span>
                          {typeof r?.delta === "number" ? (
                            <span style={{ color: "#667085" }}> — Δ {r.delta.toFixed(3)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 13, color: "#12B76A", fontWeight: 800 }}>
                      No significant risk detected.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}