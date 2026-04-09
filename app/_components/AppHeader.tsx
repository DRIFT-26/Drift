"use client";

import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export default function AppHeader() {
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();

    // Clear local session and go back to landing page
    window.location.href = "/";
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
      }}
    >
      <Link
        href="/"
        style={{
          fontSize: 12,
          letterSpacing: 0.5,
          fontWeight: 900,
          color: "#E6EAF0",
          textDecoration: "none",
        }}
      >
        DRIFT
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 12, color: "#9AA4B2" }}>Command Center</div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "#E6EAF0",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}