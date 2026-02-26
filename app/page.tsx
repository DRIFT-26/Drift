// app/page.tsx
import Link from "next/link";

export const runtime = "nodejs";

function baseUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = (process.env.VERCEL_URL || "").trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  // fallback (safe in prod)
  return "https://drift-app-indol.vercel.app";
}

export default function HomePage() {
  const site = baseUrl();

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 700px at 20% -10%, rgba(41,112,255,0.20), transparent 55%)," +
          "radial-gradient(900px 600px at 90% 0%, rgba(2,122,72,0.18), transparent 60%)," +
          "#0B1220",
        color: "#FFFFFF",
        fontFamily: "system-ui",
      }}
    >
      {/* Top Nav */}
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "18px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "rgba(255,255,255,0.85)",
              boxShadow: "0 0 0 4px rgba(255,255,255,0.08)",
            }}
          />
          <div style={{ fontWeight: 900, letterSpacing: 0.6 }}>DRIFT</div>
          <div style={{ opacity: 0.7, fontSize: 12, letterSpacing: 0.3 }}>
            Revenue Intelligence
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link
            href="/alerts"
            style={{
              color: "rgba(255,255,255,0.85)",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            View Alerts
          </Link>

          <Link
            href="/onboard"
            style={{
              textDecoration: "none",
              fontWeight: 900,
              fontSize: 13,
              color: "#0B1220",
              background: "#FFFFFF",
              padding: "10px 14px",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            Request Access
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "56px 20px 32px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 28,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.85)",
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: 0.3,
              }}
            >
              <span style={{ opacity: 0.9 }}>Founding Cohort Beta</span>
              <span style={{ opacity: 0.45 }}>·</span>
              <span style={{ opacity: 0.9 }}>Quiet by design</span>
            </div>

            <h1
              style={{
                marginTop: 16,
                marginBottom: 12,
                fontSize: 52,
                lineHeight: 1.02,
                letterSpacing: -1.2,
                fontWeight: 950,
              }}
            >
              Before it’s obvious.
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.78)",
                maxWidth: 680,
              }}
            >
              DRIFT is a revenue intelligence layer that detects material deviation
              before it becomes visible in dashboards — and delivers CEO-grade signals
              daily and weekly.
            </p>

            <div style={{ marginTop: 22, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href="/onboard"
                style={{
                  textDecoration: "none",
                  fontWeight: 950,
                  fontSize: 14,
                  color: "#0B1220",
                  background: "#FFFFFF",
                  padding: "12px 16px",
                  borderRadius: 14,
                  boxShadow: "0 16px 45px rgba(0,0,0,0.45)",
                }}
              >
                Request Access
              </Link>

              <a
                href={`${site}/alerts`}
                style={{
                  textDecoration: "none",
                  fontWeight: 900,
                  fontSize: 14,
                  color: "rgba(255,255,255,0.88)",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "12px 16px",
                  borderRadius: 14,
                }}
              >
                View Live Demo
              </a>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 12px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.70)",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                <span style={{ opacity: 0.9 }}>Signals, not noise.</span>
                <span style={{ opacity: 0.35 }}>·</span>
                <span style={{ opacity: 0.9 }}>Quiet in the background.</span>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                color: "rgba(255,255,255,0.55)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              Built for owner/operators, CEOs, and operators who want early warning —
              without living inside dashboards.
            </div>
          </div>

          {/* Right-side “Elite Card” */}
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 20,
              padding: 18,
              boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800, letterSpacing: 0.3 }}>
              DRIFT SIGNAL
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexDirection: "column" }}>
              <CardRow title="Status" value="Stable ✅ / Watch 🟡 / Attention 🔴" />
              <CardRow title="Cadence" value="Daily signals + Weekly pulse" />
              <CardRow title="Scope" value="Per business, portfolio view included" />
              <CardRow title="Data" value="Stripe (optional) + CSV fallback" />
            </div>

            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.70)",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              DRIFT runs quietly and only surfaces what matters — so the first thing you
              check each morning is the signal.
            </div>
          </div>
        </div>
      </div>

      {/* 3-column value */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 20px 46px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          <Feature
            title="Detect deviation early"
            desc="Find material changes in revenue and refund behavior before dashboards look different."
          />
          <Feature
            title="CEO-grade language"
            desc="Short. Specific. Actionable. Signals written for decisions — not analysis."
          />
          <Feature
            title="Quiet by default"
            desc="No busywork. No checking dashboards all day. DRIFT surfaces the moments that matter."
          />
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: 16,
            borderRadius: 18,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.78)" }}>
            <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>
              Want DRIFT running on your businesses?
            </div>
            <div style={{ fontSize: 13, opacity: 0.70, marginTop: 4 }}>
              Join the Founding Cohort Beta — limited seats.
            </div>
          </div>

          <Link
            href="/onboard"
            style={{
              textDecoration: "none",
              fontWeight: 950,
              fontSize: 14,
              color: "#0B1220",
              background: "#FFFFFF",
              padding: "12px 16px",
              borderRadius: 14,
              boxShadow: "0 16px 45px rgba(0,0,0,0.45)",
            }}
          >
            Request Access
          </Link>
        </div>

        <div
          style={{
            marginTop: 28,
            paddingTop: 18,
            borderTop: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.45)",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>© {new Date().getFullYear()} DRIFT</div>
          <div style={{ opacity: 0.9 }}>
            <span style={{ marginRight: 10 }}>Privacy-first signals</span>
            <span style={{ opacity: 0.35 }}>·</span>
            <span style={{ marginLeft: 10 }}>Built for operators</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardRow(props: { title: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 14,
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.70, fontWeight: 800 }}>{props.title}</div>
      <div style={{ fontSize: 12, opacity: 0.92, fontWeight: 900, textAlign: "right" }}>
        {props.value}
      </div>
    </div>
  );
}

function Feature(props: { title: string; desc: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 18,
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>{props.title}</div>
      <div style={{ marginTop: 8, fontSize: 13, opacity: 0.72, lineHeight: 1.55 }}>
        {props.desc}
      </div>
    </div>
  );
}