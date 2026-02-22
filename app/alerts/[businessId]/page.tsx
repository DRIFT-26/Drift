// app/alerts/[businessId]/page.tsx
import Link from "next/link";
import { headers } from "next/headers";

type DriftStatus = "stable" | "watch" | "softening" | "attention";
type RiskLabel = "Low" | "Moderate" | "High";

function normalizeUrlBase(raw: string) {
  const v = raw.trim().replace(/\/$/, "");
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

async function absoluteBaseUrl() {
  // 1) Explicit site url (only if non-empty)
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit && explicit.trim()) return normalizeUrlBase(explicit);

  // 2) Vercel URL (only if non-empty)
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.trim()) return normalizeUrlBase(vercel);

  // 3) Derive from request headers (Next 16 headers() is async in your setup)
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${proto}://${host}`;

  // 4) Hard fallback
  return "https://drift-app-indol.vercel.app";
}

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
  const v = typeof value === "number" ? value : 0;
  return `${(v * 100).toFixed(1)}%`;
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

async function safeReadJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!ct.includes("application/json")) {
    return {
      ok: false,
      error: `API did not return JSON (status ${res.status}). First bytes: ${text.slice(0, 80)}`,
    };
  }

  try {
    return JSON.parse(text);
  } catch (e: any) {
    return { ok: false, error: `Invalid JSON: ${e?.message ?? String(e)}` };
  }
}

export default async function BusinessAlertsPage({
  params,
}: {
  params: Promise<{ businessId?: string }> | { businessId?: string };
}) {
  const resolvedParams = await Promise.resolve(params as any);
  const businessId = resolvedParams?.businessId;

  if (!businessId || businessId === "undefined") {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>Missing businessId in route params.</div>
        <div style={{ marginTop: 10, color: "#667085" }}>
          Try: <code>/alerts/&lt;uuid&gt;</code>
        </div>
      </div>
    );
  }

  const base = await absoluteBaseUrl();
  const apiUrl = new URL("/api/alerts", base);
  apiUrl.searchParams.set("business_id", businessId);

  let payload: any;
  try {
    const res = await fetch(apiUrl.toString(), { cache: "no-store" });
    payload = await safeReadJson(res);
    if (!res.ok && payload?.ok !== false) payload = { ok: false, error: `HTTP ${res.status}` };
  } catch (e: any) {
    payload = { ok: false, error: e?.message ?? String(e) };
  }

  if (!payload?.ok) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Alerts</h1>
        <div style={{ marginTop: 10, color: "#B42318" }}>
          Failed to load business: {payload?.error ?? "unknown_error"}
        </div>
        <div style={{ marginTop: 10 }}>
          <Link href="/alerts" style={{ color: "#175CD3" }}>
            ← Back to Alerts
          </Link>
        </div>
      </div>
    );
  }

  const business = payload.business;
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];

  const lastDrift = business?.last_drift ?? null;
  const latestAlert = alerts?.[0] ?? null;

  const driftMeta = (lastDrift?.meta ?? latestAlert?.meta ?? {}) as any;
  const driftStatus = normalizeStatus(lastDrift?.status ?? latestAlert?.status ?? "stable");
  const driftReasons = (lastDrift?.reasons ?? latestAlert?.reasons ?? []) as any[];

  const engine = String(driftMeta?.engine ?? "revenue_v1");
  const direction = normalizeDirection(driftMeta?.direction);
  const mriScore = typeof driftMeta?.mriScore === "number" ? driftMeta.mriScore : null;

  const revenueMeta = driftMeta?.revenue ?? {};
  const refundsMeta = driftMeta?.refunds ?? {};

  const baselineNet14dRaw =
    revenueMeta?.baselineNetRevenueCents14d ?? revenueMeta?.baselineNetRevenueCentsPer14d;
  const baselineNet14d = typeof baselineNet14dRaw === "number" ? baselineNet14dRaw : toNum(baselineNet14dRaw);

  const currentNet14dRaw =
    revenueMeta?.currentNetRevenueCents14d ?? revenueMeta?.currentNetRevenueCentsPer14d;
  const currentNet14d = typeof currentNet14dRaw === "number" ? currentNet14dRaw : toNum(currentNet14dRaw);

  const deltaPct = typeof revenueMeta?.deltaPct === "number" ? revenueMeta.deltaPct : null;

  const refundRateCurrent =
    typeof refundsMeta?.currentRefundRate === "number"
      ? refundsMeta.currentRefundRate
      : typeof refundsMeta?.refund_rate === "number"
      ? refundsMeta.refund_rate
      : null;

  const refundRateBaseline =
    typeof refundsMeta?.baselineRefundRate === "number" ? refundsMeta.baselineRefundRate : null;

  const monthlyRevenueCents = typeof business?.monthly_revenue_cents === "number" ? business.monthly_revenue_cents : null;

  const tone = statusTone(driftStatus);
  const riskLabel = projectRiskLabel(driftStatus, mriScore);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", background: "#F8FAFC", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: "#667085", letterSpacing: 0.4 }}>DRIFT / EXECUTIVE SIGNAL</div>
          <h1 style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 900, color: "#101828" }}>
            {business?.name ?? "Business"}
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Engine: <span style={{ color: "#101828", fontWeight: 700 }}>{engine}</span>
            {direction ? (
              <>
                {" · "}Direction: <span style={{ color: "#101828", fontWeight: 700 }}>{direction}</span>
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
          >
            Risk: {riskLabel}
          </div>

          <Link href="/alerts" style={{ color: "#175CD3", fontWeight: 700, fontSize: 13 }}>
            Back
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
        <div style={{ gridColumn: "span 4", background: "#fff", border: "1px solid #EAECF0", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>MRI SCORE</div>
          <div style={{ marginTop: 8, fontSize: 34, fontWeight: 950, color: "#101828" }}>
            {typeof mriScore === "number" ? clamp(mriScore, 0, 100) : "—"}
          </div>
        </div>

        <div style={{ gridColumn: "span 4", background: "#fff", border: "1px solid #EAECF0", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>NET REVENUE (14D)</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: "#101828" }}>
            {formatMoney(currentNet14d)}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Baseline: {formatMoney(baselineNet14d)}
            {typeof deltaPct === "number" ? <> {" · "}Δ {(deltaPct * 100).toFixed(0)}%</> : null}
          </div>
        </div>

        <div style={{ gridColumn: "span 4", background: "#fff", border: "1px solid #EAECF0", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>REFUND RATE (14D)</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: "#101828" }}>
            {refundRateCurrent == null ? "—" : formatPct(refundRateCurrent)}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Baseline: {refundRateBaseline == null ? "—" : formatPct(refundRateBaseline)}
          </div>
        </div>

        <div style={{ gridColumn: "span 12", background: "#fff", border: "1px solid #EAECF0", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>WHY THIS STATUS</div>

          {driftReasons?.length ? (
            <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: "#101828" }}>
              {driftReasons.map((r: any, i: number) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <span style={{ fontWeight: 900 }}>{String(r?.code ?? "SIGNAL")}</span>
                  <span style={{ color: "#667085" }}> — </span>
                  <span>{String(r?.detail ?? "—")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ marginTop: 10, color: "#667085", fontSize: 13 }}>Drift currently reads as stable.</div>
          )}

          <div style={{ marginTop: 14, borderTop: "1px solid #EAECF0", paddingTop: 12, fontSize: 12, color: "#667085" }}>
            Business ID: <code>{businessId}</code>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#667085" }}>
            Monthly Revenue (manual): {monthlyRevenueCents == null ? "—" : formatMoney(monthlyRevenueCents)}
          </div>
        </div>
      </div>
    </div>
  );
}