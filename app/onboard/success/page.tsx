import { Suspense } from "react";
import SuccessClient from "./SuccessClient";

export const dynamic = "force-dynamic";

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div style={{ maxWidth: 520, margin: "60px auto", padding: 20 }}>
          <h1>Payment Successful</h1>
          <p style={{ opacity: 0.7 }}>Loading details…</p>
        </div>
      }
    >
      <SuccessClient />
    </Suspense>
  );
}