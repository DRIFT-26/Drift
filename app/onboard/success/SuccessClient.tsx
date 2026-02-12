"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SuccessClient() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [msg] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 520, margin: "60px auto", padding: 20 }}>
      <h1>Payment Successful</h1>
      <p style={{ opacity: 0.7 }}>
        Thanks — DRIFT will keep monitoring and emailing you.
      </p>

      {sessionId && (
        <p style={{ fontSize: 12, opacity: 0.6 }}>session_id: {sessionId}</p>
      )}

      {msg && <p>{msg}</p>}
    </div>
  );
}