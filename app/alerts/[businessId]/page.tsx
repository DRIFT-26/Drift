import UpgradeButton from "../UpgradeButton";
import SendTestSummaryButton from "./SendTestSummaryButton";

async function getAlerts(businessId: string) {
  const res = await fetch(
    `http://localhost:3000/api/alerts?business_id=${businessId}`,
    { cache: "no-store" }
  );
  return res.json();
}

function statusEmoji(status: string) {
  if (status === "stable") return "🟢";
  if (status === "softening") return "🟡";
  return "🔴";
}

function severityMessage(status: string) {
  if (status === "attention") {
    return "Immediate attention recommended.";
  }
  if (status === "softening") {
    return "Monitor this trend.";
  }
  return "No action required.";
}

function whyItMatters(reasons: any[]) {
  if (!reasons || reasons.length === 0) return null;

  const codes = reasons.map((r) => r.code);

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

  const codes = reasons.map((r) => r.code);

  if (codes.includes("REV_FREQ_DROP_30")) {
    return "Ask 5–10 recent customers for a review this week.";
  }

  if (codes.includes("ENG_DROP_30")) {
    return "Send one short re-engagement message to your audience.";
  }

  if (codes.includes("SENTIMENT_DROP_50")) {
    return "Review recent feedback and address one negative experience publicly.";
  }

  return "Keep monitoring — no immediate action needed.";
}

export default async function AlertsPage(props: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await props.params;

  if (!businessId) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <h1>DRIFT Alerts</h1>
        <p style={{ color: "crimson" }}>Missing businessId in the route.</p>
      </main>
    );
  }

  const data = await getAlerts(businessId);

  if (!data?.ok) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <h1>DRIFT Alerts</h1>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </main>
    );
  }

  const alerts = data.alerts ?? [];
  const isPaid = Boolean(data?.business?.is_paid);

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 900 }}>
      <h1 style={{ marginBottom: 12 }}>DRIFT Alerts</h1>

      <p style={{ marginTop: 0, color: "#555" }}>
        Business: <code>{businessId}</code>
      </p>

      {/* Premium explainer */}
      <div
        style={{
          marginTop: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 16,
          background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "-0.01em",
            marginBottom: 6,
          }}
        >
          How DRIFT works
        </div>

{isPaid ? <SendTestSummaryButton businessId={businessId} /> : null}

{!isPaid && alerts.length > 0 ? (
  <div style={{ marginTop: 12 }}>
    <UpgradeButton businessId={businessId} />
  </div>
) : null}

        <div
          style={{
            fontSize: 14,
            color: "#4b5563",
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          DRIFT compares recent performance to your historical baseline and alerts you when
          meaningful shifts in customer momentum appear.
        </div>

        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 14,
            color: "#111827",
            lineHeight: 1.6,
          }}
        >
          <li>Review volume and sentiment trends</li>
          <li>Audience engagement signals</li>
          <li>Short-term changes that often precede revenue impact</li>
        </ul>
      </div>

      {!isPaid && alerts.length > 0 ? (
  <div style={{ marginTop: 12 }}>
    <UpgradeButton businessId={businessId} />
  </div>
) : null}

      {alerts.length === 0 ? (
        <p style={{ marginTop: 14 }}>No alerts yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {alerts.map((a: any) => (
            <div
              key={a.id}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                padding: 14,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {statusEmoji(a.status)} {String(a.status).toUpperCase()}
                </div>
                <div style={{ color: "#666" }}>
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </div>

              <div style={{ marginTop: 8, color: "#444" }}>
                Window: <strong>{a.window_start}</strong> → <strong>{a.window_end}</strong>
              </div>

              <div
  style={{
    marginTop: 8,
    fontSize: 14,
    fontWeight: 600,
    color:
      a.status === "attention"
        ? "#b91c1c"
        : a.status === "softening"
        ? "#92400e"
        : "#065f46",
  }}
>
  {severityMessage(a.status)}
</div>

              <ul style={{ marginTop: 10 }}>
                {(a.reasons ?? []).map((r: any, idx: number) => (
                  <li key={idx}>
                    <code>{r.code}</code> — {r.detail}
                    {typeof r.delta === "number" ? (
                      <> (Δ {Math.round(r.delta * 1000) / 10}%)</>
                    ) : null}
                  </li>
                ))}
              </ul>

              {whyItMatters(a.reasons) && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 8,
                    background: "#f9fafb",
                    fontSize: 14,
                    color: "#333",
                  }}
                >
                  <strong>Why this matters:</strong> {whyItMatters(a.reasons)}
                </div>
              )}

              {suggestedNextStep(a.reasons) && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 8,
                    background: "#eef6ff",
                    fontSize: 14,
                    color: "#1f2937",
                  }}
                >
                  <strong>Suggested next step:</strong> {suggestedNextStep(a.reasons)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}