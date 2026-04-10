"use client";

import { useState } from "react";

export default function UpgradeButton({
  businessId,
  totalLocations,
  includedLocations = 3,
  additionalLocations,
}: {
  businessId: string;
  totalLocations: number;
  includedLocations?: number;
  additionalLocations: number;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onUpgrade() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok || !data?.url) {
        throw new Error(data?.error || "Checkout failed");
      }

      window.location.href = data.url;
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 18,
        marginBottom: 14,
        background: "rgba(255,255,255,0.04)",
        color: "#E6EAF0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: 680 }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: 0.4,
              color: "rgba(230,234,240,0.55)",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Trial Complete
          </div>

          <div
            style={{
              fontWeight: 800,
              fontSize: 18,
              marginTop: 6,
              color: "#E6EAF0",
            }}
          >
            Activate DRIFT for your portfolio
          </div>

          <div
            style={{
              color: "rgba(230,234,240,0.72)",
              fontSize: 14,
              lineHeight: 1.55,
              marginTop: 8,
            }}
          >
            Your trial has ended. Continue monitoring revenue movement, receiving
            operator-grade signal alerts, and keeping your Command Center active
            by activating your plan.
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gap: 8,
              color: "rgba(230,234,240,0.78)",
              fontSize: 14,
            }}
          >
            <div>
              <strong style={{ color: "#FFFFFF" }}>$499/month</strong> standard
              pricing
            </div>
            <div>
              <strong style={{ color: "#FFFFFF" }}>$299/month</strong> for 12
              months or <strong style={{ color: "#FFFFFF" }}>$399/month</strong>{" "}
              lifetime Founding Cohort pricing
            </div>
            <div>
              Includes up to{" "}
              <strong style={{ color: "#FFFFFF" }}>{includedLocations}</strong>{" "}
              location{includedLocations === 1 ? "" : "s"} per portfolio
            </div>
            <div>
              Portfolio currently monitoring{" "}
              <strong style={{ color: "#FFFFFF" }}>{totalLocations}</strong>{" "}
              location{totalLocations === 1 ? "" : "s"}
            </div>

            {additionalLocations > 0 ? (
              <div style={{ color: "#FFC266" }}>
                <strong style={{ color: "#FFFFFF" }}>
                  +{additionalLocations}
                </strong>{" "}
                additional billable location
                {additionalLocations === 1 ? "" : "s"} beyond the included
                portfolio threshold
              </div>
            ) : (
              <div>
                Your current portfolio is within the included location threshold.
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "rgba(230,234,240,0.5)",
            }}
          >
            DRIFT is priced at the portfolio level — not per seat, dashboard, or report.
          </div>
        </div>

        <button
          onClick={onUpgrade}
          disabled={loading}
          style={{
            border: 0,
            borderRadius: 12,
            padding: "12px 16px",
            fontWeight: 800,
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
            background: "#FFFFFF",
            color: "#000000",
            minWidth: 160,
          }}
        >
          {loading ? "Redirecting…" : "Activate DRIFT"}
        </button>
      </div>

      {err ? (
        <div
          style={{
            marginTop: 12,
            color: "#FF8A8A",
            fontSize: 13,
          }}
        >
          {err}
        </div>
      ) : null}
    </div>
  );
}