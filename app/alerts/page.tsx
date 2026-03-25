// app/alerts/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";

type DriftStatus = "stable" | "watch" | "softening" | "attention";

function normalizeStatus(raw: any): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
  return "stable";
}

function statusTone(status: DriftStatus) {
  switch (status) {
    case "attention":
      return { bg: "#FEF3F2", fg: "#B42318", border: "#FECDCA" };
    case "softening":
      return { bg: "#FFFAEB", fg: "#B54708", border: "#FEDF89" };
    case "watch":
      return { bg: "#F0F9FF", fg: "#026AA2", border: "#B9E6FE" };
    case "stable":
    default:
      return { bg: "#ECFDF3", fg: "#027A48", border: "#ABEFC6" };
  }
}

function severityRank(s: DriftStatus) {
  if (s === "attention") return 0;
  if (s === "softening") return 1;
  if (s === "watch") return 2;
  return 3;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMoneyFromBusiness(b: any) {
  const cents =
    typeof b?.monthly_revenue_cents === "number"
      ? b.monthly_revenue_cents
      : typeof b?.monthly_revenue === "number"
      ? Math.round(b.monthly_revenue * 100)
      : null;

  if (typeof cents !== "number") return "—";
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function safeDateLabel(v: any) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function AlertsIndexPage() {
  const supabase = supabaseAdmin();

  const { data: businesses, error } = await supabase
    .from("businesses")
    .select(
      "id,name,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents,created_at"
    )
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: "system-ui",
          background: "#F8FAFC",
          minHeight: "100vh",
        }}
      >
        <div style={{ fontSize: 12, color: "#667085", letterSpacing: 0.4 }}>
          DRIFT / PORTFOLIO
        </div>
        <h1
          style={{
            margin: "6px 0 0",
            fontSize: 26,
            fontWeight: 900,
            color: "#101828",
          }}
        >
          Alerts
        </h1>

        <div
          style={{
            marginTop: 14,
            padding: 14,
            background: "#fff",
            border: "1px solid #EAECF0",
            borderRadius: 14,
          }}
        >
          <div style={{ color: "#B42318", fontWeight: 800 }}>
            Failed to load portfolio
          </div>
          <div style={{ marginTop: 6, color: "#667085", fontSize: 13 }}>
            {error.message}
          </div>
        </div>
      </div>
    );
  }

  const normalized = (businesses ?? []).map((b: any) => {
    const last = b?.last_drift ?? null;
    const status = normalizeStatus(last?.status ?? "stable");
    const score =
      typeof last?.meta?.mriScore === "number"
        ? clamp(last.meta.mriScore, 0, 100)
        : null;
    const engine = String(last?.meta?.engine ?? "—");
    const updated = b?.last_drift_at ?? null;

    return { ...b, _status: status, _score: score, _engine: engine, _updated: updated };
  });

  const sorted = normalized.slice().sort((a, b) => {
    const r = severityRank(a._status) - severityRank(b._status);
    if (r !== 0) return r;

    const as = typeof a._score === "number" ? a._score : 999;
    const bs = typeof b._score === "number" ? b._score : 999;
    if (as !== bs) return as - bs;

    return String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
  });

  const counts = sorted.reduce(
    (acc, b) => {
      acc.total += 1;
      acc[b._status] += 1;
      return acc;
    },
    { total: 0, stable: 0, watch: 0, softening: 0, attention: 0 } as any
  );

  const filtered = sorted;

  return (
    <div
      style={{
        padding: 24,
        fontFamily: "system-ui",
        background: "#F8FAFC",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#667085", letterSpacing: 0.4 }}>
            DRIFT / PORTFOLIO
          </div>
          <h1
            style={{
              margin: "6px 0 0",
              fontSize: 28,
              fontWeight: 950,
              color: "#101828",
            }}
          >
            Executive Alerts
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Prioritized by severity. Click a business to review signals.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            href="/onboard"
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: "#101828",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            + Add Business
          </Link>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 12,
        }}
      >
        {(["attention", "softening", "watch", "stable"] as DriftStatus[]).map(
          (s) => {
            const tone = statusTone(s);
            const label = s.toUpperCase();
            const value = counts[s] ?? 0;

            return (
              <div
                key={s}
                style={{
                  gridColumn: "span 3",
                  background: "#fff",
                  border: "1px solid #EAECF0",
                  borderRadius: 16,
                  padding: 14,
                  boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#667085", fontWeight: 800 }}>
                    {label}
                  </div>
                  <div
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: tone.bg,
                      color: tone.fg,
                      border: `1px solid ${tone.border}`,
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    {value}
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#667085" }}>
                  Portfolio total:{" "}
                  <span style={{ color: "#101828", fontWeight: 900 }}>
                    {counts.total}
                  </span>
                </div>
              </div>
            );
          }
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, color: "#667085" }}>
            Showing{" "}
            <span style={{ color: "#101828", fontWeight: 900 }}>
              {filtered.length}
            </span>{" "}
            businesses
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: 12,
          }}
        >
          {filtered.map((b: any) => {
            const tone = statusTone(b._status);
            const score = b._score;
            const engine = b._engine;
            const updated = safeDateLabel(b._updated);

            return (
              <Link
                key={b.id}
                href={`/alerts/${b.id}`}
                style={{
                  gridColumn: "span 12",
                  background: "#fff",
                  border: "1px solid #EAECF0",
                  borderRadius: 16,
                  padding: 16,
                  textDecoration: "none",
                  color: "#101828",
                  boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 950,
                      color: "#101828",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b?.name ?? "Business"}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: "#667085" }}>
                    Engine:{" "}
                    <span style={{ color: "#101828", fontWeight: 800 }}>
                      {engine}
                    </span>
                    {" · "}
                    Updated:{" "}
                    <span style={{ color: "#101828", fontWeight: 800 }}>
                      {updated}
                    </span>
                    {" · "}
                    Monthly:{" "}
                    <span style={{ color: "#101828", fontWeight: 800 }}>
                      {formatMoneyFromBusiness(b)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: tone.bg,
                      color: tone.fg,
                      border: `1px solid ${tone.border}`,
                      fontWeight: 900,
                      fontSize: 12,
                      letterSpacing: 0.2,
                    }}
                  >
                    {String(b._status).toUpperCase()}
                  </div>

                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 12,
                      background: "#F9FAFB",
                      border: "1px solid #EAECF0",
                      fontWeight: 900,
                      fontSize: 12,
                      color: "#101828",
                      minWidth: 86,
                      textAlign: "center",
                    }}
                    title="Risk Index"
                  >
                    MRI: {typeof score === "number" ? score : "—"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}