"use client";

import { useState } from "react";

export default function UpgradeButton({ businessId }: { businessId: string }) {
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
    <div style={{ border: "1px solid #e6e6e6", borderRadius: 12, padding: 14, marginBottom: 14, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Email alerts are a paid feature</div>
          <div style={{ color: "#555", fontSize: 14, marginTop: 4 }}>
            Upgrade to receive daily changes + weekly summaries by email.
          </div>
        </div>

        <button
          onClick={onUpgrade}
          disabled={loading}
          style={{ border: 0, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Redirecting…" : "Upgrade"}
        </button>
      </div>

      {err ? <div style={{ marginTop: 10, color: "crimson", fontSize: 13 }}>{err}</div> : null}
    </div>
  );
}