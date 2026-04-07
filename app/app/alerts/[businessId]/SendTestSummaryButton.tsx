"use client";

import { useState } from "react";

export default function SendTestSummaryButton({ businessId }: { businessId: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/jobs/weekly?force_send=true`, { method: "POST" });
      const data = await res.json();
      if (!data?.ok) {
        setMsg(data?.error ?? "Failed to send summary.");
      } else {
        setMsg("✅ Summary email triggered. Check your inbox.");
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={send}
        disabled={loading}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "#111827",
          color: "white",
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Sending..." : "Send me a test summary"}
      </button>

      {msg ? <div style={{ marginTop: 8, fontSize: 13, color: "#374151" }}>{msg}</div> : null}
      <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
        Paid accounts can trigger a weekly summary on demand.
      </div>
    </div>
  );
}