// app/alerts/page.tsx
import Link from "next/link";

type DriftStatus = "stable" | "watch" | "softening" | "attention";

function normalizeStatus(raw: any): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
  return "stable";
}

function statusColor(status: DriftStatus) {
  switch (status) {
    case "attention":
      return { bg: "#FEF3F2", fg: "#B42318", border: "#FECDCA" };
    case "softening":
      return { bg: "#FFFAEB", fg: "#B54708", border: "#FEDF89" };
    case "watch":
      return { bg: "#F0F9FF", fg: "#026AA2", border: "#B9E6FE" };
    default:
      return { bg: "#ECFDF3", fg: "#027A48", border: "#ABEFC6" };
  }
}

export default async function AlertsIndexPage() {
  // Server-side only secret. Never exposed to browser.
  const token =
    process.env.DRIFT_CRON_SECRET ||
    process.env.DRIFT_LOCAL_API_TOKEN ||
    process.env.DRIFT_ADMIN_TOKEN;

  if (!token) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>
          Missing server token. Set DRIFT_CRON_SECRET (or DRIFT_ADMIN_TOKEN) in Vercel env.
        </div>
      </div>
    );
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/alerts`, {
    // If NEXT_PUBLIC_SITE_URL is unset, this still works as a relative fetch in most Next deployments,
    // but keeping it explicit is safer. If you prefer, change to just "/api/alerts".
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const first = (await res.text()).slice(0, 120);
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>
          API did not return JSON (status {res.status}). First bytes: {first}
        </div>
      </div>
    );
  }

  const payload = await res.json();
  if (!payload?.ok) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>
          Failed to load businesses: {payload?.error ?? "unknown_error"}
        </div>
      </div>
    );
  }

  const businesses = Array.isArray(payload.businesses) ? payload.businesses : [];

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", background: "#F8FAFC", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <div style={{ fontSize: 12, color: "#667085", letterSpacing: 0.4 }}>
            DRIFT / EXECUTIVE SIGNAL
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 950, color: "#101828" }}>
            Alerts
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Portfolio view (multi-business ready)
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          background: "#fff",
          border: "1px solid #EAECF0",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: 0,
            padding: "12px 14px",
            background: "#F9FAFB",
            borderBottom: "1px solid #EAECF0",
            fontSize: 12,
            color: "#667085",
            fontWeight: 800,
          }}
        >
          <div>BUSINESS</div>
          <div>STATUS</div>
          <div>MRI</div>
          <div>UPDATED</div>
        </div>

        {businesses.length ? (
          businesses.map((b: any) => {
            const last = b?.last_drift ?? null;
            const meta = last?.meta ?? {};
            const status = normalizeStatus(last?.status ?? "stable");
            const tone = statusColor(status);
            const mri = typeof meta?.mriScore === "number" ? meta.mriScore : "—";
            const updated = b?.last_drift_at ? String(b.last_drift_at) : "—";

            return (
              <Link
                key={b.id}
                href={`/alerts/${b.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: "14px",
                  textDecoration: "none",
                  color: "#101828",
                  borderBottom: "1px solid #F2F4F7",
                }}
              >
                <div style={{ fontWeight: 900 }}>{b?.name ?? b.id}</div>

                <div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: tone.bg,
                      color: tone.fg,
                      border: `1px solid ${tone.border}`,
                      fontSize: 12,
                      fontWeight: 900,
                      letterSpacing: 0.2,
                    }}
                  >
                    {status.toUpperCase()}
                  </span>
                </div>

                <div style={{ fontWeight: 900 }}>{mri}</div>
                <div style={{ color: "#667085", fontSize: 12 }}>{updated}</div>
              </Link>
            );
          })
        ) : (
          <div style={{ padding: 14, color: "#667085" }}>No businesses found.</div>
        )}
      </div>
    </div>
  );
}