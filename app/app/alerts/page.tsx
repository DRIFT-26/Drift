import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { formatReason } from "@/lib/executive/reasons";
import { cookies } from "next/headers";
import {
  ONBOARD_ACCESS_COOKIE,
  verifyOnboardAccessToken,
} from "@/lib/auth/onboard-access";
import { businessHasAccess } from "@/lib/billing/access";
import AlertsTitleSync from "./AlertsTitleSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DriftStatus =
  | "stable"
  | "watch"
  | "softening"
  | "attention"
  | "movement";

function normalizeStatus(raw: unknown): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
  if (s === "movement") return "movement";
  return "stable";
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
        bg: "rgba(56, 189, 248, 0.12)",
        fg: "#7DD3FC",
        border: "rgba(56, 189, 248, 0.24)",
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMoneyFromBusiness(b: {
  monthly_revenue_cents?: number | null;
  monthly_revenue?: number | null;
}) {
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

function safeDateLabel(v: unknown, timeZone?: string | null) {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    timeZone: timeZone || "America/Chicago",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function mriLabel(score: number | null, status: DriftStatus) {
  if (typeof score !== "number") return "—";
  if (status === "attention") return "At Risk";
  if (status === "softening") return "Unstable";
  if (status === "watch") return "Developing";
  if (status === "movement") return "Accelerating";
  return "Stable";
}

function statusLabel(status: DriftStatus) {
  if (status === "attention") return "Immediate Attention";
  if (status === "softening") return "Unstable";
  if (status === "watch") return "Developing";
  if (status === "movement") return "Momentum Detected";
  return "Stable";
}

function getTrialDaysLeft(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;

  const now = new Date();
  const end = new Date(trialEndsAt);
  const diff = end.getTime() - now.getTime();

  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

type DriftReason = {
  code?: string | null;
  detail?: string | null;
  label?: string | null;
  message?: string | null;
  reason?: string | null;
};

type BusinessRow = {
  id: string;
  name: string;
  timezone?: string | null;
  last_drift: {
    status?: string | null;
    reasons?: DriftReason[] | null;
    meta?: {
      mriScore?: number | null;
      engine?: string | null;
    } | null;
  } | null;
  last_drift_at: string | null;
  monthly_revenue: number | null;
  monthly_revenue_cents: number | null;
  created_at: string | null;
  billing_status: string | null;
  trial_ends_at?: string | null;
};

export default async function AlertsIndexPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const onboardAccess = verifyOnboardAccessToken(
    cookieStore.get(ONBOARD_ACCESS_COOKIE)?.value
  );

  const userId = user?.id ?? null;
  const onboardEmail = onboardAccess?.email ?? null;
  const sessionEmail = user?.email ?? null;
  const email = onboardEmail ?? sessionEmail ?? null;

  if (!userId && !email) {
    redirect("/login");
  }

  let businesses: BusinessRow[] | null = null;
  let error: { message?: string } | null = null;

  if (onboardEmail) {
    const emailMatch = await supabase
      .from("businesses")
      .select(
        "id,name,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents,created_at,billing_status,trial_ends_at"
      )
      .eq("alert_email", onboardEmail)
      .order("created_at", { ascending: true })
      .returns<BusinessRow[]>();

    businesses = emailMatch.data ?? null;
    error = emailMatch.error;
  } else if (userId) {
    const ownerMatch = await supabase
      .from("businesses")
      .select(
        "id,name,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents,created_at,billing_status,trial_ends_at"
      )
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .returns<BusinessRow[]>();

    businesses = ownerMatch.data ?? null;
    error = ownerMatch.error;

    if ((!businesses || businesses.length === 0) && sessionEmail) {
      const emailMatch = await supabase
        .from("businesses")
        .select(
          "id,name,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents,created_at,billing_status,trial_ends_at"
        )
        .eq("alert_email", sessionEmail)
        .order("created_at", { ascending: true })
        .returns<BusinessRow[]>();

      businesses = emailMatch.data ?? null;
      error = emailMatch.error;
    }
  } else if (email) {
    const emailMatch = await supabase
      .from("businesses")
      .select(
        "id,name,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents,created_at,billing_status,trial_ends_at"
      )
      .eq("alert_email", email)
      .order("created_at", { ascending: true })
      .returns<BusinessRow[]>();

    businesses = emailMatch.data ?? null;
    error = emailMatch.error;
  }

  const totalLocations = businesses?.length || 0;
  const includedLocations = 3;
  const additionalLocations = Math.max(totalLocations - includedLocations, 0);

  const portfolioHasAccess =
    (businesses ?? []).some((b) =>
      businessHasAccess({
        billing_status: b.billing_status,
        trial_ends_at: b.trial_ends_at ?? null,
      })
    ) || false;

  const isReadOnly = !portfolioHasAccess && (businesses ?? []).length > 0;

  const statusPriority: Record<string, number> = {
    attention: 1,
    softening: 2,
    watch: 3,
    movement: 4,
    stable: 5,
  };

  if (error) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background: "#0B0F14",
          minHeight: "100vh",
          color: "#E6EAF0",
        }}
      >
        <h1
          style={{
            margin: "6px 0 0",
            fontSize: 30,
            fontWeight: 950,
            color: "#E6EAF0",
          }}
        >
          Executive Signal Feed
        </h1>

        <div
          style={{
            marginTop: 16,
            padding: 18,
            background: "#11161C",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 18,
          }}
        >
          <div style={{ color: "#FF8A8A", fontWeight: 800 }}>
            Failed to load portfolio
          </div>
          <div style={{ marginTop: 6, color: "#9AA4B2", fontSize: 13 }}>
            {error.message}
          </div>
        </div>
      </div>
    );
  }

  const normalized = (businesses ?? [])
  .filter((b) => {
    // Only include businesses with real signal data
    return b?.last_drift && b?.last_drift?.status;
  })
  .map((b) => {
    const last = b?.last_drift ?? null;
    const status = normalizeStatus(last?.status ?? "stable");

    const score =
      typeof last?.meta?.mriScore === "number"
        ? clamp(last.meta.mriScore, 0, 100)
        : null;

    const updated = b?.last_drift_at ?? null;

    const reason =
      Array.isArray(last?.reasons) && last.reasons.length > 0
        ? formatReason(last.reasons[0])
        : "Signal detected";

    return {
      ...b,
      _status: status,
      _score: score,
      _updated: updated,
      _reason: reason,
    };
  });

  const sorted = normalized.slice().sort((a, b) => {
    const aStatus = a._status ?? "stable";
    const bStatus = b._status ?? "stable";

    const statusDiff = statusPriority[aStatus] - statusPriority[bStatus];
    if (statusDiff !== 0) return statusDiff;

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
    {
      total: 0,
      stable: 0,
      watch: 0,
      softening: 0,
      attention: 0,
      movement: 0,
    } as Record<DriftStatus | "total", number>
  );

  const overallStatus: DriftStatus =
    counts.attention > 0
      ? "attention"
      : counts.softening > 0
      ? "softening"
      : counts.watch > 0
      ? "watch"
      : counts.movement > 0
      ? "movement"
      : "stable";

  return (
    <div
      style={{
        padding: 24,
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background:
          "radial-gradient(circle at top, rgba(10,42,102,0.18), transparent 24%), #0B0F14",
        minHeight: "100vh",
        color: "#E6EAF0",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <AlertsTitleSync status={overallStatus} />

        {!isReadOnly && businesses && businesses.length > 0 ? (() => {
  const trialEndsAt = businesses[0]?.trial_ends_at;
  const daysLeft = getTrialDaysLeft(trialEndsAt);

  if (daysLeft === null) return null;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 16px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 13, color: "#9AA4B2" }}>
        <span style={{ color: "#E6EAF0", fontWeight: 800 }}>
          Trial active
        </span>
        {" · "}
        {daysLeft} day{daysLeft === 1 ? "" : "s"} left
      </div>

      <Link
        href={`/upgrade?business_id=${encodeURIComponent(businesses[0].id)}`}
        style={{
          padding: "6px 12px",
          borderRadius: 10,
          background: "#0A2A66",
          color: "#FFFFFF",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        Activate DRIFT
      </Link>
    </div>
  );
})() : null}

        {isReadOnly ? (
          <div
            style={{
              marginBottom: 16,
              padding: 16,
              borderRadius: 16,
              background: "rgba(255, 176, 32, 0.10)",
              border: "1px solid rgba(255, 176, 32, 0.20)",
              color: "#FDE68A",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14 }}>Read-only access</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#F8E7B0" }}>
              Your trial has ended. Monitoring has paused, but your signal
              history remains visible. Reactivate DRIFT to restore active
              monitoring, ongoing alerts, and portfolio expansion.
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                margin: "6px 0 0",
                fontSize: 32,
                lineHeight: 1.05,
                fontWeight: 950,
                color: "#E6EAF0",
              }}
            >
              Executive Signal Feed
            </h1>
            <div style={{ marginTop: 8, fontSize: 14, color: "#9AA4B2" }}>
              Prioritized by severity. Review what matters first.
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#9AA4B2" }}>
              Portfolio:{" "}
              <span style={{ color: "#E6EAF0", fontWeight: 800 }}>
                {totalLocations}
              </span>{" "}
              location{totalLocations === 1 ? "" : "s"}
              {additionalLocations > 0 ? (
                <>
                  {" · "}
                  <span style={{ color: "#FFC266", fontWeight: 800 }}>
                    +{additionalLocations}
                  </span>{" "}
                  additional billable location
                  {additionalLocations === 1 ? "" : "s"}
                </>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link
              href={
                isReadOnly && businesses && businesses[0]?.id
                  ? `/upgrade?business_id=${encodeURIComponent(
                      businesses[0].id
                    )}`
                  : "/onboard?mode=add_business"
              }
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "#0A2A66",
                color: "#FFFFFF",
                textDecoration: "none",
                fontWeight: 800,
                fontSize: 13,
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {isReadOnly ? "Activate DRIFT" : "+ Add Business"}
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
          {(["attention", "softening", "watch", "stable"] as DriftStatus[]).map(
            (s) => {
              const tone = statusTone(s);
              const label = statusLabel(s);
              const value = counts[s] ?? 0;

              return (
                <div
                  key={s}
                  style={{
                    gridColumn: "span 3",
                    background: "#11161C",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 18,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "#9AA4B2",
                        fontWeight: 800,
                        letterSpacing: 0.3,
                      }}
                    >
                      {label.toUpperCase()}
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

                  <div style={{ marginTop: 12, fontSize: 12, color: "#9AA4B2" }}>
                    Portfolio total:{" "}
                    <span style={{ color: "#E6EAF0", fontWeight: 900 }}>
                      {counts.total}
                    </span>
                  </div>
                </div>
              );
            }
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, color: "#9AA4B2" }}>
            Showing{" "}
            <span style={{ color: "#E6EAF0", fontWeight: 900 }}>
              {sorted.length}
            </span>{" "}
            businesses
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gap: 12,
            }}
          >
            {sorted.map((b) => {
              const tone = statusTone(b._status);
              const score = b._score;
              const updated = safeDateLabel(b._updated, b.timezone);

              return (
                <Link
                  key={b.id}
                  href={`/app/alerts/${b.id}`}
                  style={{
                    gridColumn: "span 12",
                    background: "#11161C",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 18,
                    padding: 18,
                    textDecoration: "none",
                    color: "#E6EAF0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 900,
                        color: "#E6EAF0",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {String(b?.name ?? "").includes("—") ? (
                        <div>
                          <div>{String(b?.name ?? "").split("—")[0].trim()}</div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#9AA4B2",
                              marginTop: 2,
                            }}
                          >
                            {String(b?.name ?? "").split("—")[1].trim()}
                          </div>
                        </div>
                      ) : (
                        <div>{b?.name ?? "Business"}</div>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        color: "#D0D5DD",
                        fontWeight: 700,
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b._reason}
                    </div>

                    <div
                      style={{
                        marginTop: 7,
                        fontSize: 12,
                        color: "#9AA4B2",
                        lineHeight: 1.5,
                      }}
                    >
                      Updated:{" "}
                      <span style={{ color: "#E6EAF0", fontWeight: 800 }}>
                        {updated}
                      </span>
                      {" · "}
                      Monthly:{" "}
                      <span style={{ color: "#E6EAF0", fontWeight: 800 }}>
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
                      {statusLabel(b._status)}
                    </div>

                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 12,
                        background: "#0F141A",
                        border: "1px solid rgba(255,255,255,0.06)",
                        fontWeight: 900,
                        fontSize: 12,
                        color: "#E6EAF0",
                        minWidth: 128,
                        textAlign: "center",
                      }}
                      title="Momentum Risk Index (MRI): measures how stable or at-risk revenue is relative to baseline"
                    >
                      MRI: {typeof score === "number" ? score : "—"}
                      {typeof score === "number"
                        ? ` · ${mriLabel(score, b._status)}`
                        : ""}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}