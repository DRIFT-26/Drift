// app/alerts/[businessId]/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type DriftStatus = "stable" | "watch" | "softening" | "attention";
type RiskLabel = "Low" | "Moderate" | "High";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNum(v: any, fallback = 0) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(cents: number | null | undefined) {
  const c = typeof cents === "number" ? cents : 0;
  return (c / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatPct(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return `${(value * 100).toFixed(1)}%`;
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

function normalizeStatus(raw: any): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
  return "stable";
}

function normalizeDirection(raw: any): "up" | "down" | "flat" | null {
  const s = String(raw ?? "").toLowerCase();
  if (s === "up") return "up";
  if (s === "down") return "down";
  if (s === "flat") return "flat";
  return null;
}

function projectRiskLabel(status: DriftStatus, score: number | null): RiskLabel {
  if (status === "attention") return "High";
  if (status === "softening" || status === "watch") return "Moderate";
  if (typeof score === "number" && score < 80) return "Moderate";
  return "Low";
}

export default async function BusinessAlertsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  if (!businessId || businessId === "undefined") {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>Missing businessId in route params.</div>
        <div style={{ marginTop: 10, color: "#667085" }}>
          Try: <code>/alerts/&lt;uuid&gt;</code>
        </div>
        <div style={{ marginTop: 10 }}>
          <Link href="/alerts" style={{ color: "#175CD3" }}>
            ← Back to Alerts
          </Link>
        </div>
      </div>
    );
  }

  const supabase = supabaseAdmin();

  // Pull business
  const { data: business, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,is_paid,alert_email,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents")
    .eq("id", businessId)
    .single();

  if (bErr || !business) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>
          Failed to load business: {bErr?.message ?? "not_found"}
        </div>
        <div style={{ marginTop: 10 }}>
          <Link href="/alerts" style={{ color: "#175CD3" }}>
            ← Back to Alerts
          </Link>
        </div>
      </div>
    );
  }

  // Pull alerts
  const { data: alertsRows, error: aErr } = await supabase
    .from("alerts")
    .select("id,business_id,status,reasons,window_start,window_end,created_at,meta")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (aErr) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>
          Failed to load alerts: {aErr.message}
        </div>
        <div style={{ marginTop: 10 }}>
          <Link href="/alerts" style={{ color: "#175CD3" }}>
            ← Back to Alerts
          </Link>
        </div>
      </div>
    );
  }

  const alerts = Array.isArray(alertsRows) ? alertsRows : [];

  // ---- Hybrid drift fallback chain (newest first) ----
  const lastDrift: any = (business as any)?.last_drift ?? null;
  const latestAlert: any = alerts?.[0] ?? null;

  const driftMeta: any = lastDrift?.meta ?? latestAlert?.meta ?? {};
  const driftStatus = normalizeStatus(lastDrift?.status ?? latestAlert?.status ?? "stable");
  const driftReasons: any[] = (lastDrift?.reasons ?? latestAlert?.reasons ?? []) as any[];

  const engine = String(driftMeta?.engine ?? "revenue_v1");
  const direction = normalizeDirection(driftMeta?.direction);
  const mriScore = typeof driftMeta?.mriScore === "number" ? driftMeta.mriScore : null;

  const revenueMeta: any = driftMeta?.revenue ?? {};
  const refundsMeta: any = driftMeta?.refunds ?? {};

  // Prefer v1 names, tolerate older names
  const baselineNet14dRaw =
    revenueMeta?.baselineNetRevenueCents14d ?? revenueMeta?.baselineNetRevenueCentsPer14d;
  const currentNet14dRaw =
    revenueMeta?.currentNetRevenueCents14d ?? revenueMeta?.currentNetRevenueCentsPer14d;

  const baselineNet14d =
    typeof baselineNet14dRaw === "number" ? baselineNet14dRaw : toNum(baselineNet14dRaw, 0);
  const currentNet14d =
    typeof currentNet14dRaw === "number" ? currentNet14dRaw : toNum(currentNet14dRaw, 0);

  const deltaPct = typeof revenueMeta?.deltaPct === "number" ? revenueMeta.deltaPct : null;

  const refundRateCurrent =
    typeof refundsMeta?.currentRefundRate === "number"
      ? refundsMeta.currentRefundRate
      : typeof refundsMeta?.refund_rate === "number"
      ? refundsMeta.refund_rate
      : null;

  const refundRateBaseline =
    typeof refundsMeta?.baselineRefundRate === "number" ? refundsMeta.baselineRefundRate : null;

  // Monthly revenue: support cents OR dollars
  const monthlyRevenueCents =
    typeof (business as any)?.monthly_revenue_cents === "number"
      ? (business as any).monthly_revenue_cents
      : typeof (business as any)?.monthly_revenue === "number"
      ? Math.round((business as any).monthly_revenue * 100)
      : null;

  const tone = statusTone(driftStatus);
  const riskLabel = projectRiskLabel(driftStatus, mriScore);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", background: "#F8FAFC", minHeight: "100vh" }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: "#667085", letterSpacing: 0.4 }}>
            DRIFT / EXECUTIVE SIGNAL
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 900, color: "#101828" }}>
            {business?.name ?? "Business"}
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Engine: <span style={{ color: "#101828", fontWeight: 700 }}>{engine}</span>
            {direction ? (
              <>
                {" · "}Direction:{" "}
                <span style={{ color: "#101828", fontWeight: 700 }}>{direction}</span>
              </>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              background: tone.bg,
              color: tone.fg,
              border: `1px solid ${tone.border}`,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 0.2,
            }}
          >
            {driftStatus.toUpperCase()}
          </div>

          <div
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              background: "#FFFFFF",
              border: "1px solid #EAECF0",
              boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
              fontSize: 13,
              color: "#101828",
              fontWeight: 800,
            }}
            title="Risk projection label"
          >
            Risk: {riskLabel}
          </div>

          <Link href="/alerts" style={{ color: "#175CD3", fontWeight: 700, fontSize: 13 }}>
            Back
          </Link>
        </div>
      </div>

      {/* KPI grid */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 12,
        }}
      >
        <div
          style={{
            gridColumn: "span 4",
            background: "#fff",
            border: "1px solid #EAECF0",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
          }}
        >
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>MRI SCORE</div>
          <div style={{ marginTop: 8, fontSize: 34, fontWeight: 950, color: "#101828" }}>
            {typeof mriScore === "number" ? clamp(mriScore, 0, 100) : "—"}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Executive stability index (0–100)
          </div>
        </div>

        <div
          style={{
            gridColumn: "span 4",
            background: "#fff",
            border: "1px solid #EAECF0",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
          }}
        >
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>NET REVENUE (14D)</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: "#101828" }}>
            {formatMoney(currentNet14d)}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Baseline: {formatMoney(baselineNet14d)}{" "}
            {typeof deltaPct === "number" ? (
              <>
                {" · "}Δ {(deltaPct * 100).toFixed(0)}%
              </>
            ) : null}
          </div>
        </div>

        <div
          style={{
            gridColumn: "span 4",
            background: "#fff",
            border: "1px solid #EAECF0",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
          }}
        >
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>REFUND RATE (14D)</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: "#101828" }}>
            {formatPct(refundRateCurrent)}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Baseline: {formatPct(refundRateBaseline)}
          </div>
        </div>

        <div
          style={{
            gridColumn: "span 12",
            background: "#fff",
            border: "1px solid #EAECF0",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>WHY THIS STATUS</div>
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 900, color: "#101828" }}>
                {driftReasons?.length ? "Key signals detected" : "No negative signals detected"}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
                CEO-readable: short, specific, actionable.
              </div>
            </div>

            <div
              style={{
                minWidth: 260,
                background: "#F9FAFB",
                border: "1px solid #EAECF0",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>CONTEXT</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#101828", fontWeight: 800 }}>
                Monthly Revenue (manual)
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#667085" }}>
                {monthlyRevenueCents == null ? "—" : formatMoney(monthlyRevenueCents)}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#667085" }}>
                Used later for impact estimates (optional).
              </div>
            </div>
          </div>

          {driftReasons?.length ? (
            <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: "#101828" }}>
              {driftReasons.map((r: any, i: number) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <span style={{ fontWeight: 900 }}>{String(r?.code ?? "SIGNAL")}</span>
                  <span style={{ color: "#667085" }}> — </span>
                  <span>{String(r?.detail ?? "—")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ marginTop: 14, color: "#667085", fontSize: 13 }}>
              Drift currently reads as stable. When signals appear, you’ll see them here.
            </div>
          )}

          <div style={{ marginTop: 14, borderTop: "1px solid #EAECF0", paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: "#667085" }}>
              Business ID: <code>{businessId}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}