"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SuccessPage() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionId = params.get("session_id");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    async function resolveAndRedirect() {
      try {
        const res = await fetch(
          `/api/billing/session?session_id=${sessionId}`
        );
        const data = await res.json();

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to resolve business");
        }

        router.replace(`/alerts/${data.businessId}`);
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong");
      }
    }

    resolveAndRedirect();
  }, [sessionId, router]);

  return (
    <div style={{ maxWidth: 520, margin: "60px auto", padding: 20 }}>
      <h1>Payment successful</h1>
      <p style={{ opacity: 0.7 }}>
        Finalizing your setup…
      </p>

      {error ? (
        <p style={{ color: "crimson" }}>{error}</p>
      ) : (
        <p style={{ fontSize: 14, opacity: 0.6 }}>
          Redirecting you to your alerts.
        </p>
      )}
    </div>
  );
}