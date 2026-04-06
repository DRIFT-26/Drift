// app/alerts/[businessId]/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatReason } from "@/lib/executive/reasons";

type DriftStatus =
  | "stable"
  | "watch"
  | "softening"
  | "attention"
  | "movement";
type RiskLabel = "Low" | "Moderate" | "High";
type Direction = "up" | "down" | "flat" | null;

type DriftReason = {
  code?: string | null;
  detail?: string | null;
  label?: string | null;
  message?: string | null;
  reason?: string | null;
};

type RevenueMeta = {
  baselineNetRevenueCents14d?: number | string | null;
  baselineNetRevenueCentsPer14d?: number | string | null;
  currentNetRevenueCents14d?: number | string | null;
  currentNetRevenueCentsPer14d?: number | string | null;
  deltaPct?: number | null;
};

type RefundsMeta = {
  currentRefundRate?: number | null;
  refund_rate?: number | null;
  baselineRefundRate?: number | null;
};

type DriftMeta = {
  engine?: string | null;
  direction?: string | null;
  mriScore?: number | null;
  revenue?: RevenueMeta | null;
  refunds?: RefundsMeta | null;
};

type LastDrift = {
  status?: string | null;
  meta?: DriftMeta | null;
  reasons?: DriftReason[] | null;
};

type BusinessRow = {
  id: string;
  name: string;
  last_drift: LastDrift | null;
  last_drift_at: string | null;
  monthly_revenue: number | null;
  monthly_revenue_cents: number | null;
  created_at: string | null;
};

type EmailLogRow = {
  id: string;
  business_id: string | null;
  email_type: string | null;
  created_at: string | null;
  subject: string | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNum(v: unknown, fallback: number | null = 0) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? (n as number) : fallback;
}

function formatMoney(cents: number | null | undefined) {
  if (typeof cents !== "number") return "—";
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function formatPct(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function statusTone(status: DriftStatus) {
  switch (status) {
    case "attention":
      return {
        bg: "rgba(255, 107, 107, 0.12)",
        fg: "#FF8A8A",
        border: "rgba(255, 107, 107, 0.24)",
      };
    case "softening":
      return {
        bg: "rgba(255, 176, 32, 0.12)",
        fg: "#FFC266",
        border: "rgba(255, 176, 32, 0.24)",
      };
    case "watch":
      return {
        bg: "rgba(90, 169, 255, 0.12)",
        fg: "#8BC1FF",
        border: "rgba(90, 169, 255, 0.24)",
      };
    case "movement":
      return {
        bg: "rgba(56, 189, 248, 0.14)",
        fg: "#7DD3FC",
        border: "rgba(56, 189, 248, 0.26)",
      };
    case "stable":
    default:
      return {
        bg: "rgba(74, 222, 128, 0.12)",
        fg: "#86EFAC",
        border: "rgba(74, 222, 128, 0.24)",
      };
  }
}

function normalizeStatus(raw: unknown): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
  if (s === "movement") return "movement";
  return "stable";
}

function normalizeDirection(raw: unknown): Direction {
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

function isUuidLike(v: string) {
  return /^[0-9a-fA-F-]{32,36}$/.test(v);
}

function mriLabel(score: number | null, status: DriftStatus) {
  if (typeof score !== "number") return "—";
  if (status === "attention") return "At Risk";
  if (status === "softening") return "Unstable";
  if (status === "watch") return "Developing";
  return "Stable";
}

function sourceLabel(engine: string) {
  const value = engine.toLowerCase();
  if (value === "stripe_revenue" || value === "stripe") return "Stripe";
  if (value === "google_sheets_revenue" || value === "google_sheets") {
    return "Google Sheets";
  }
  if (value === "csv_revenue" || value === "csv") return "CSV Upload";
  return "Revenue Source";
}

function statusLabel(status: DriftStatus) {
  if (status === "attention") return "Immediate Attention";
  if (status === "softening") return "Unstable";
  if (status === "watch") return "Developing";
  if (status === "movement") return "Momentum Detected";
  return "Stable";
}

function safeDateTimeLabel(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function recommendedAction(status: DriftStatus, reasons: DriftReason[]) {
  const primary = reasons?.[0];
  const code = String(primary?.code ?? "").toUpperCase();

  if (code === "REV_FREQ_DROP_30") {
    return "Increase customer touchpoints and prompt recent customers for feedback.";
  }

  if (code === "ENG_DROP_30") {
    return "Review recent campaign performance and identify engagement drop-off points.";
  }

  if (code === "SENTIMENT_DROP_50") {
    return "Audit recent customer feedback and address negative experience drivers.";
  }

  if (code === "BASELINE_WARMUP") {
    return "Allow more data to accumulate before making operational changes.";
  }

  if (status === "attention") {
    return "Investigate immediately and prioritize corrective action within 24–48 hours.";
  }

  if (status === "softening") {
    return "Identify early drivers and intervene before further decline.";
  }

  if (status === "watch") {
    return "Monitor closely and validate whether this trend continues.";
  }

  return "Maintain current performance and monitor for changes.";
}

function timelineStatusFromEmailType(emailType: string | null | undefined): DriftStatus {
  const value = String(emailType ?? "").toLowerCase();
  if (value === "daily_alert") return "attention";
  if (value === "daily_monitor") return "watch";
  return "stable";
}

function timelineHeadline(subject: string | null | undefined): string {
  const text = String(subject ?? "").trim();
  if (!text) return "Signal event recorded";

  const cleaned = text
    .replace(/^DRIFT\s*(Daily Monitor|Weekly Pulse|Trial Status|Monitoring Started)\s*—\s*/i, "")
    .replace(/^DRIFT\s*—\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();

  return cleaned || text;
}

function formatEventType(type?: string | null) {
  if (!type) return "Signal";

  if (type === "daily_alert") return "Action Needed";
  if (type === "daily_monitor") return "Monitoring";
  if (type === "weekly_pulse") return "Weekly Pulse";

  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const pageBg = "radial-gradient(circle at top, rgba(10,42,102,0.18), transparent 24%), #0B0F14";
const cardBg = "#11161C";
const subCardBg = "#0F141A";
const border = "1px solid rgba(255,255,255,0.06)";
const textPrimary = "#E6EAF0";
const textSecondary = "#9AA4B2";
const textMuted = "#6B7280";

export default async function BusinessAlertsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId?: string }> | { businessId?: string };
  searchParams?: Promise<{ eventId?: string }> | { eventId?: string };
}) {
  const resolved = (await Promise.resolve(params)) as { businessId?: string };
  const businessId = resolved?.businessId;
  const resolvedSearch = searchParams
  ? ((await Promise.resolve(searchParams)) as { eventId?: string })
  : {};

const eventId = resolvedSearch?.eventId ?? "";

  if (!businessId || businessId === "undefined" || !isUuidLike(businessId)) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background: pageBg,
          minHeight: "100vh",
          color: textPrimary,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 900 }}>Executive Signal</h1>
        <div style={{ marginTop: 10, color: "#FF8A8A" }}>
          Missing business ID in route params.
        </div>
        <div style={{ marginTop: 10, color: textSecondary }}>
          Try: <code>/alerts/&lt;uuid&gt;</code>
        </div>
      </div>
    );
  }

  const supabase = supabaseAdmin();

  const { data: business, error } = await supabase
    .from("businesses")
    .select(
      "id,name,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents,created_at"
    )
    .eq("id", businessId)
    .single<BusinessRow>();

  const { data: timeline } = await supabase
    .from("email_logs")
    .select("id,business_id,email_type,created_at,subject")
    .eq("business_id", businessId)
    .in("email_type", ["daily_alert", "daily_monitor", "weekly_pulse"])
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<EmailLogRow[]>();

  if (error || !business) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background: pageBg,
          minHeight: "100vh",
          color: textPrimary,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 900 }}>Executive Signal</h1>
        <div style={{ marginTop: 10, color: "#FF8A8A" }}>
          Failed to load business: {error?.message ?? "not_found"}
        </div>
        <div style={{ marginTop: 10 }}>
          <Link href="/alerts" style={{ color: "#8BC1FF" }}>
            ← Back to Alerts
          </Link>
        </div>
      </div>
    );
  }

  const lastDrift = business.last_drift ?? null;
  const driftMeta: DriftMeta = lastDrift?.meta ?? {};
  const driftStatus = normalizeStatus(lastDrift?.status ?? "stable");
  const driftReasons: DriftReason[] = Array.isArray(lastDrift?.reasons)
    ? lastDrift.reasons
    : [];

  const engine = String(driftMeta.engine ?? "—");
  const direction = normalizeDirection(driftMeta.direction);
  const mriScore =
    typeof driftMeta.mriScore === "number"
      ? clamp(driftMeta.mriScore, 0, 100)
      : null;

  const revenueMeta: RevenueMeta = driftMeta.revenue ?? {};
  const refundsMeta: RefundsMeta = driftMeta.refunds ?? {};

  const baselineNet14dRaw =
    revenueMeta.baselineNetRevenueCents14d ??
    revenueMeta.baselineNetRevenueCentsPer14d;
  const baselineNet14d =
    typeof baselineNet14dRaw === "number"
      ? baselineNet14dRaw
      : toNum(baselineNet14dRaw, null);

  const currentNet14dRaw =
    revenueMeta.currentNetRevenueCents14d ??
    revenueMeta.currentNetRevenueCentsPer14d;
  const currentNet14d =
    typeof currentNet14dRaw === "number"
      ? currentNet14dRaw
      : toNum(currentNet14dRaw, null);

  const deltaPct =
    typeof revenueMeta.deltaPct === "number" ? revenueMeta.deltaPct : null;

  const refundRateCurrent =
    typeof refundsMeta.currentRefundRate === "number"
      ? refundsMeta.currentRefundRate
      : typeof refundsMeta.refund_rate === "number"
      ? refundsMeta.refund_rate
      : null;

  const refundRateBaseline =
    typeof refundsMeta.baselineRefundRate === "number"
      ? refundsMeta.baselineRefundRate
      : null;

  const monthlyRevenueCents =
    typeof business.monthly_revenue_cents === "number"
      ? business.monthly_revenue_cents
      : typeof business.monthly_revenue === "number"
      ? Math.round(business.monthly_revenue * 100)
      : null;

  const tone = statusTone(driftStatus);
  const riskLabel = projectRiskLabel(driftStatus, mriScore);

  const headlineReason =
    driftReasons.length > 0 ? formatReason(driftReasons[0]) : "Signal detected";

  return (
    <div
      style={{
        padding: 24,
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background:
  driftStatus === "attention"
    ? "radial-gradient(circle at top, rgba(255,107,107,0.14), transparent 22%), #0B0F14"
    : driftStatus === "softening"
    ? "radial-gradient(circle at top, rgba(255,176,32,0.12), transparent 22%), #0B0F14"
    : driftStatus === "watch"
    ? "radial-gradient(circle at top, rgba(90,169,255,0.12), transparent 22%), #0B0F14"
    : "radial-gradient(circle at top, rgba(10,42,102,0.18), transparent 24%), #0B0F14",
        minHeight: "100vh",
        color: textPrimary,
      }}
    >
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div
  style={{
    borderLeft: `3px solid ${tone.fg}`,
    paddingLeft: 14,
  }}
>
            <div style={{ fontSize: 12, color: textSecondary, letterSpacing: 0.5 }}>
              DRIFT / EXECUTIVE BRIEF
            </div>
            <h1
              style={{
                margin: "6px 0 0",
                fontSize: 30,
                lineHeight: 1.1,
                fontWeight: 950,
                color: textPrimary,
              }}
            >
              {business.name ?? "Business"}
            </h1>

            <div
              style={{
                marginTop: 10,
                fontSize: 16,
                fontWeight: 800,
                color: "#D0D5DD",
                lineHeight: 1.35,
              }}
            >
              {headlineReason}
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: textSecondary,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: textPrimary, fontWeight: 800 }}>
                Recommended Action:
              </span>{" "}
              {recommendedAction(driftStatus, driftReasons)}
            </div>
            

            <div style={{ marginTop: 6, fontSize: 13, color: textSecondary, lineHeight: 1.5,}}>
  {driftStatus === "attention" &&
    "If unaddressed, this may begin impacting revenue performance within days."}
  {driftStatus === "softening" &&
    "Left unchecked, this trend may develop into a larger performance issue."}
  {driftStatus === "watch" &&
    "Early signal detected — validating now can prevent larger disruption."}
</div>

            <div style={{ marginTop: 8, fontSize: 13, color: textSecondary }}>
              Source:{" "}
              <span style={{ color: textPrimary, fontWeight: 700 }}>
                {sourceLabel(engine)}
              </span>
              {" · "}
              Updated:{" "}
              <span style={{ color: textPrimary, fontWeight: 700 }}>
                {safeDateTimeLabel(business.last_drift_at)}
              </span>
              {direction ? (
                <>
                  {" · "}
                  Momentum:{" "}
                  <span style={{ color: textPrimary, fontWeight: 700 }}>
                    {direction === "up"
                      ? "Rising"
                      : direction === "down"
                      ? "Slowing"
                      : "Stable"}
                  </span>
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
              {statusLabel(driftStatus)}
            </div>

            <div
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                background: subCardBg,
                border,
                fontSize: 12,
                color: "#D0D5DD",
                fontWeight: 700,
              }}
              title="Risk projection label"
            >
              Next 7–14 days: {riskLabel} risk
            </div>

            <Link
              href="/alerts"
              style={{ color: "#8BC1FF", fontWeight: 700, fontSize: 13 }}
            >
              Back
            </Link>
          </div>
        </div>

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
              background: cardBg,
              border,
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: textSecondary, fontWeight: 700 }}>
              MRI SCORE
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 34,
                fontWeight: 950,
                color: textPrimary,
              }}
            >
              {typeof mriScore === "number" ? mriScore : "—"}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: textSecondary }}>
              Momentum Risk Index ·{" "}
              <span style={{ color: textPrimary, fontWeight: 800 }}>
                {mriLabel(mriScore, driftStatus)}
              </span>
            </div>
          </div>

          <div
            style={{
              gridColumn: "span 4",
              background: cardBg,
              border,
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: textSecondary, fontWeight: 700 }}>
              NET REVENUE (14D)
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 28,
                fontWeight: 950,
                color: textPrimary,
              }}
            >
              {formatMoney(currentNet14d)}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: textSecondary }}>
              Baseline: {formatMoney(baselineNet14d)}
              {typeof deltaPct === "number" ? (
                <>
                  {" · "}
                  <span style={{ color: textPrimary, fontWeight: 800 }}>
                    Δ {(deltaPct * 100).toFixed(0)}%
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div
            style={{
              gridColumn: "span 4",
              background: cardBg,
              border,
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: textSecondary, fontWeight: 700 }}>
              REFUND RATE (14D)
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 28,
                fontWeight: 950,
                color: textPrimary,
              }}
            >
              {formatPct(refundRateCurrent)}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: textSecondary }}>
              Baseline: {formatPct(refundRateBaseline)}
            </div>
          </div>

          <div
            style={{
              gridColumn: "span 8",
              background: cardBg,
              border,
              borderRadius: 18,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 12, color: textSecondary, fontWeight: 700 }}>
              WHY THIS STATUS
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 15,
                fontWeight: 900,
                color: textPrimary,
              }}
            >
              {driftReasons.length
                ? "What DRIFT is seeing right now"
                : "No material negative signals detected"}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: textSecondary }}>
              These are the signal conditions currently shaping this status.
            </div>

            {driftReasons.length ? (
              <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: textPrimary }}>
                {driftReasons.map((r, i) => (
                  <li key={i} style={{ marginBottom: 16, lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 900 }}>
  {String(r?.code ?? "") === "BASELINE_WARMUP"
    ? "Baseline Building"
    : formatReason(r)}
</div>

{r?.code === "REV_FREQ_DROP_30" && (
  <div style={{ marginTop: 4, fontSize: 13, color: "#9AA4B2" }}>
    Check customer return frequency and recent transaction patterns.
  </div>
)}

{r?.code === "ENG_DROP_30" && (
  <div style={{ marginTop: 4, fontSize: 13, color: "#9AA4B2" }}>
    Review campaign performance and recent engagement drop-offs.
  </div>
)}

{r?.code === "SENTIMENT_DROP_50" && (
  <div style={{ marginTop: 4, fontSize: 13, color: "#9AA4B2" }}>
    Audit customer feedback and recent experience signals.
  </div>
)}
                    {r?.detail ? (
                      <div style={{ marginTop: 2, color: textSecondary, fontSize: 13 }}>
                        {String(r.detail)}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ marginTop: 14, color: textSecondary, fontSize: 13 }}>
                DRIFT currently reads as stable. When signals appear, you’ll see
                them here.
              </div>
            )}

            <div
  style={{
    marginTop: 16,
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 1.5,
  }}
>
  {driftStatus === "attention" &&
    "These signals indicate active performance risk. Immediate attention is recommended."}

  {driftStatus === "softening" &&
    "These signals suggest early decline. Addressing now may prevent deeper impact."}

  {driftStatus === "watch" &&
    "These signals are developing. Early validation can prevent escalation."}
</div>
          </div>

          <div
            style={{
              gridColumn: "span 4",
              background: cardBg,
              border,
              borderRadius: 18,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 12, color: textSecondary, fontWeight: 700 }}>
              BUSINESS CONTEXT
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                color: textPrimary,
                fontWeight: 800,
              }}
            >
              Monthly Revenue
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: textSecondary }}>
              {formatMoney(monthlyRevenueCents)}
            </div>

            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                color: textPrimary,
                fontWeight: 800,
              }}
            >
              Risk Projection
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: textSecondary }}>
              Current status indicates{" "}
              <span style={{ color: textPrimary, fontWeight: 800 }}>
                {riskLabel}
              </span>{" "}
              near-term risk.
            </div>

            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                color: textPrimary,
                fontWeight: 800,
              }}
            >
              Signal ID
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: textSecondary,
                wordBreak: "break-all",
              }}
            >
              <code>{businessId}</code>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: textSecondary }}>
              This context helps frame the likely business impact of the current signal.
            </div>
          </div>

          <div
            style={{
              gridColumn: "span 12",
              background: cardBg,
              border,
              borderRadius: 18,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 12, color: textSecondary, fontWeight: 700 }}>
              SIGNAL TIMELINE
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 15,
                fontWeight: 900,
                color: textPrimary,
              }}
            >
              Recent DRIFT signal history for this business
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: textSecondary }}>
              A chronological view of recent signal events and alerts delivered.
            </div>

            {timeline && timeline.length > 0 ? (
  <div
    style={{
      marginTop: 16,
      position: "relative",
      paddingLeft: 20,
      display: "grid",
      gap: 14,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 7,
        top: 4,
        bottom: 4,
        width: 2,
        background: "rgba(255,255,255,0.08)",
      }}
    />

    {timeline.map((item) => {
      const itemStatus = timelineStatusFromEmailType(item.email_type);
      const itemTone = statusTone(itemStatus);

      return (
        <div
          key={item.id}
          id={item.id}
          style={{
  position: "relative",
  display: "grid",
  gap: 6,
  background:
    eventId === item.id ? "rgba(255,255,255,0.04)" : "transparent",
  borderRadius: 12,
  padding:
    eventId === item.id ? "10px 10px 10px 18px" : "0 0 0 18px",
}}
        >
          <div
            style={{
              position: "absolute",
              left: -1,
              top: 6,
              width: 10,
              height: 10,
              borderRadius: 999,
              background: itemTone.fg,
              boxShadow: `0 0 0 4px ${itemTone.bg}`,
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: textPrimary,
                }}
              >
                {timelineHeadline(item.subject)}
              </div>

              {eventId === item.id ? (
  <div
    style={{
      marginTop: 4,
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 0.3,
      color: "#8BC1FF",
      textTransform: "uppercase",
    }}
  >
    Selected Event
  </div>
) : null}

              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: textSecondary,
                }}
              >
                {safeDateTimeLabel(item.created_at)}
                {item.email_type ? (
                  <>
                    {" · "}
                    <span style={{ fontWeight: 700 }}>
  {formatEventType(item.email_type)}
</span>
                  </>
                ) : null}
              </div>
            </div>

            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: itemTone.bg,
                color: itemTone.fg,
                border: `1px solid ${itemTone.border}`,
                fontWeight: 800,
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {statusLabel(itemStatus)}
            </div>
          </div>
        </div>
      );
    })}
  </div>
) : (
              <div style={{ marginTop: 14, color: textSecondary, fontSize: 13 }}>
                No prior signal history is available yet for this business.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}