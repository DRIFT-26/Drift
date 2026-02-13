import UpgradeButton from "../UpgradeButton";
import SendTestSummaryButton from "./SendTestSummaryButton";
import { projectRisk } from "@/lib/drift/compute";

async function getAlerts(businessId: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/alerts?business_id=${businessId}`, {
    cache: "no-store",
  });

  return res.json();
}

function statusEmoji(status: string) {
  if (status === "stable") return "🟢";
  if (status === "softening") return "🟡";
  return "🔴";
}

/**
 * Converts drift reasons into a simple score + breakdown.
 * Start at 100, subtract penalties by code.
 */
function computeSignalsFromReasons(reasons: any[]) {
  let score = 100;

  const penalties = {
    reviews: 0,
    sentiment: 0,
    engagement: 0,
  };

  const codes = (reasons ?? []).map((r: any) => String(r.code));

  // Reviews frequency
  if (codes.includes("REV_FREQ_DROP_30")) penalties.reviews += 30;
  else if (codes.includes("REV_FREQ_DROP_15")) penalties.reviews += 15;

  // Sentiment
  if (codes.includes("SENTIMENT_DROP_50")) penalties.sentiment += 30;
  else if (codes.includes("SENTIMENT_DROP_25")) penalties.sentiment += 15;

  // Engagement
  if (codes.includes("ENG_DROP_30")) penalties.engagement += 30;
  else if (codes.includes("ENG_DROP_15")) penalties.engagement += 15;

  score -= penalties.reviews + penalties.sentiment + penalties.engagement;
  score = Math.max(0, Math.min(100, score));

  return { score, penalties };
}

function whyItMatters(reasons: any[]) {
  if (!reasons || reasons.length === 0) return null;

  const codes = reasons.map((r: any) => r.code);

  if (codes.includes("REV_FREQ_DROP_30")) {
    return "Businesses often see reduced foot traffic 1–2 weeks after review activity declines.";
  }

  if (codes.includes("ENG_DROP_30")) {
    return "Lower engagement typically precedes fewer repeat visits.";
  }

  if (codes.includes("SENTIMENT_DROP_50")) {
    return "Negative sentiment trends can impact conversion and referrals.";
  }

  return "This change may indicate a shift in customer momentum.";
}

function suggestedNextStep(reasons: any[]) {
  if (!reasons || reasons.length === 0) return null;

  const codes = reasons.map((r: any) => r.code);

  if (codes.includes("REV_FREQ_DROP_30") || codes.includes("REV_FREQ_DROP_15")) {
    return "Ask 5–10 recent customers for a review this week, and make it easy (QR, link, short script).";
  }

  if (codes.includes("ENG_DROP_30") || codes.includes("ENG_DROP_15")) {
    return "Run a quick reactivation push: limited-time offer + clear CTA to your best customers.";
  }

  if (codes.includes("SENTIMENT_DROP_50") || codes.includes("SENTIMENT_DROP_25")) {
    return "Scan the last 10 reviews/complaints, pick the top 1–2 issues, and fix + reply publicly.";
  }

  return "Review the last 7–14 days of customer touchpoints and identify what changed (hours, staffing, promos, inventory, service).";
}

function scoreLabel(score: number) {
  if (score >= 85) return { label: "Strong", note: "Momentum looks healthy." };
  if (score >= 70) return { label: "Watch", note: "Early softness — worth a quick check." };
  if (score >= 50) return { label: "At Risk", note: "Momentum is slipping — act this week." };
  return { label: "Critical", note: "High risk — intervene immediately." };
}

export default async function AlertsPage(props: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await props.params;

  if (!businessId) {
    return (
      <main
        style={{
          padding: 24,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h1 style={{ margin: 0 }}>DRIFT Alerts</h1>
        <p style={{ color: "crimson" }}>Missing businessId in the route.</p>
      </main>
    );
  }

  const data = await getAlerts(businessId);

  if (!data?.ok) {
    return (
      <main
        style={{
          padding: 24,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h1 style={{ margin: 0 }}>DRIFT Alerts</h1>
        <p style={{ color: "crimson" }}>Failed to load alerts.</p>
        <pre
          style={{
            marginTop: 12,
            background: "#111",
            color: "#eee",
            padding: 12,
            borderRadius: 10,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      </main>
    );
  }

  const alerts = data.alerts ?? [];
  const business = data.business ?? null;
  const isPaid = Boolean(business?.is_paid);

  // ✅ The “latest truth” should come from business.last_drift, not alerts[0]
  const lastDrift = business?.last_drift ?? null;
  const lastDriftAt = business?.last_drift_at ?? null;

  const latestStatus = lastDrift?.status ?? null;
  const latestReasons = lastDrift?.reasons ?? [];
  const latestMeta = lastDrift?.meta ?? null;

  const signals = computeSignalsFromReasons(latestReasons);
  const meta = scoreLabel(signals.score);

  const projectionsTop =
    latestMeta &&
    projectRisk({
      reviewDrop: latestMeta.reviewDrop,
      engagementDrop: latestMeta.engagementDrop,
      sentimentDelta: latestMeta.sentimentDelta,
    });

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        maxWidth: 980,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.4 }}>DRIFT Alerts</h1>
          <div style={{ marginTop: 8, color: "#667085", fontSize: 13 }}>
            Business:{" "}
            <code style={{ background: "#F2F4F7", padding: "2px 6px", borderRadius: 8 }}>
              {businessId}
            </code>
            {business?.name ? (
              <>
                {" "}
                • <strong style={{ color: "#344054" }}>{business.name}</strong>
              </>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!isPaid ? <UpgradeButton businessId={businessId} /> : null}
          {isPaid ? <SendTestSummaryButton businessId={businessId} /> : null}
        </div>
      </div>

      {/* Premium Summary Card */}
      <div
        style={{
          border: "1px solid #EAECF0",
          borderRadius: 18,
          padding: 16,
          background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFD 100%)",
          boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: "#667085" }}>
              Latest Status
            </div>

            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>
                {latestStatus ? `${statusEmoji(latestStatus)} ${String(latestStatus).toUpperCase()}` : "—"}
              </div>

              {lastDriftAt ? (
                <div style={{ fontSize: 12, color: "#667085" }}>
                  {new Date(lastDriftAt).toLocaleString()}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 8, color: "#475467", fontSize: 13 }}>
              {latestStatus ? "Latest drift computed from the last 14 days." : "No drift computed yet."}
            </div>
          </div>

          {/* Momentum Score */}
          <div style={{ minWidth: 360, flex: "1 1 360px" }}>
            <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: "#667085" }}>
              Momentum Score
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 6,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 40, fontWeight: 950, lineHeight: 1, letterSpacing: -0.8 }}>
                    {signals.score}
                  </div>
                  <div style={{ fontSize: 14, color: "#667085" }}>/ 100</div>

                  <div
                    style={{
                      marginLeft: 10,
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid #EAECF0",
                      background: "#FFFFFF",
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#344054",
                    }}
                  >
                    {meta.label}
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>{meta.note}</div>
              </div>

              <div
                style={{
                  border: "1px solid #EAECF0",
                  borderRadius: 14,
                  padding: "10px 12px",
                  background: "#FFFFFF",
                  minWidth: 260,
                }}
              >
                <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: "#667085" }}>
                  Drivers
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: "#344054" }}>
                  Reviews: <strong>{signals.penalties.reviews}</strong> • Sentiment:{" "}
                  <strong>{signals.penalties.sentiment}</strong> • Engagement:{" "}
                  <strong>{signals.penalties.engagement}</strong>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "#F2F4F7",
                  border: "1px solid #EAECF0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${signals.score}%`,
                    background: "linear-gradient(90deg, #12B76A 0%, #FDB022 55%, #F04438 100%)",
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "#98A2B3",
                }}
              >
                <span>Critical</span>
                <span>Strong</span>
              </div>
            </div>
          </div>
        </div>

        {/* Why this matters + Suggested next step (only once) */}
        {latestReasons?.length ? (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {whyItMatters(latestReasons) ? (
              <div style={{ border: "1px solid #EAECF0", background: "#FFFFFF", borderRadius: 14, padding: 12 }}>
                <div style={{ fontWeight: 900, color: "#101828" }}>Why this matters</div>
                <div style={{ marginTop: 6, color: "#475467", fontSize: 13 }}>{whyItMatters(latestReasons)}</div>
              </div>
            ) : null}

            {suggestedNextStep(latestReasons) ? (
              <div style={{ border: "1px solid #EAECF0", background: "#FFFFFF", borderRadius: 14, padding: 12 }}>
                <div style={{ fontWeight: 900, color: "#101828" }}>Suggested next step</div>
                <div style={{ marginTop: 6, color: "#475467", fontSize: 13 }}>
                  {suggestedNextStep(latestReasons)}
                </div>
              </div>
            ) : null}

            {/* Projections: only if meta exists */}
            {Array.isArray(projectionsTop) && projectionsTop.length ? (
              <div style={{ border: "1px solid #EAECF0", background: "#FFFFFF", borderRadius: 14, padding: 12 }}>
                <div style={{ fontWeight: 900, color: "#101828" }}>Projections (next 30 days)</div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#475467", fontSize: 13, lineHeight: 1.6 }}>
                  {projectionsTop.map((p: string, i: number) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* What DRIFT is watching */}
      <div
        style={{
          border: "1px solid #EAECF0",
          borderRadius: 18,
          padding: 16,
          background: "#FFFFFF",
          boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10, color: "#101828" }}>
          What DRIFT is watching
        </div>

        <ul style={{ margin: 0, paddingLeft: 18, color: "#475467", fontSize: 13, lineHeight: 1.6 }}>
          <li>Review frequency vs baseline (signals demand shift before sales show it)</li>
          <li>Sentiment movement (quality perception + conversion impact)</li>
          <li>Engagement drop (repeat visit / reactivation risk)</li>
        </ul>
      </div>

      {/* Full Alerts List */}
      <div
        style={{
          border: "1px solid #EAECF0",
          borderRadius: 18,
          padding: 16,
          background: "#FFFFFF",
          boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12, color: "#101828" }}>
          Alert history
        </div>

        {alerts.length === 0 ? (
          <p style={{ margin: 0, color: "#667085" }}>No alerts yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {alerts.map((a: any) => {
              const projections =
                a?.meta &&
                projectRisk({
                  reviewDrop: a?.meta?.reviewDrop,
                  engagementDrop: a?.meta?.engagementDrop,
                  sentimentDelta: a?.meta?.sentimentDelta,
                });

              return (
                <div
                  key={a.id}
                  style={{
                    border: "1px solid #EAECF0",
                    borderRadius: 16,
                    padding: 14,
                    background: "#FCFCFD",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#101828" }}>
                      {statusEmoji(a.status)} {String(a.status).toUpperCase()}
                    </div>
                    <div style={{ color: "#667085", fontSize: 12 }}>
                      {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                    </div>
                  </div>

                  <div style={{ marginTop: 8, color: "#475467", fontSize: 13 }}>
                    Window: <strong>{a.window_start}</strong> → <strong>{a.window_end}</strong>
                  </div>

                  <ul style={{ marginTop: 10, marginBottom: 0, paddingLeft: 18 }}>
                    {(a.reasons ?? []).map((r: any, idx: number) => (
                      <li key={idx} style={{ color: "#344054", fontSize: 13, lineHeight: 1.5 }}>
                        <code style={{ background: "#EEF2F6", padding: "2px 6px", borderRadius: 8 }}>
                          {r.code}
                        </code>{" "}
                        — {r.detail}
                        {typeof r.delta === "number" ? <> (Δ {Math.round(r.delta * 1000) / 10}%)</> : null}
                      </li>
                    ))}
                  </ul>

                  {Array.isArray(projections) && projections.length ? (
                    <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #EAECF0", background: "#FFFFFF" }}>
                      <div style={{ fontWeight: 900, marginBottom: 6, color: "#101828" }}>
                        Projections (next 30 days)
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, color: "#475467", fontSize: 13, lineHeight: 1.6 }}>
                        {projections.map((p: string, i: number) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}