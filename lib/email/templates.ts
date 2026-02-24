// /lib/email/templates.ts

// ---------------------------------------------
// Shared Types
// ---------------------------------------------

export type DriftStatus = "stable" | "watch" | "softening" | "attention";

function baseUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = (process.env.VERCEL_URL || "").trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "https://drift-app-indol.vercel.app";
}

function normalizeStatus(raw: any): DriftStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "attention") return "attention";
  if (s === "softening") return "softening";
  if (s === "watch") return "watch";
  return "stable";
}

function formatStatusLine(status: DriftStatus) {
  switch (status) {
    case "attention":
      return "Action Needed 🔴";
    case "softening":
      return "Trending Down 🟠";
    case "watch":
      return "Movement Detected 🟡";
    default:
      return "Stable ✅";
  }
}

function statusCounts(statuses: DriftStatus[]) {
  return {
    attention: statuses.filter((s) => s === "attention").length,
    softening: statuses.filter((s) => s === "softening").length,
    watch: statuses.filter((s) => s === "watch").length,
    stable: statuses.filter((s) => s === "stable").length,
  };
}

function pickTopStatus(statuses: DriftStatus[]): DriftStatus {
  if (statuses.includes("attention")) return "attention";
  if (statuses.includes("softening")) return "softening";
  if (statuses.includes("watch")) return "watch";
  return "stable";
}

// -----------------------------------------------------
// DAILY ALERT EMAIL
// Used by /api/jobs/daily
// -----------------------------------------------------

export function renderStatusEmail(args: {
  businessName: string;
  status: DriftStatus;
  reasons?: Array<{ code?: string; detail?: string }>;
  windowStart: string;
  windowEnd: string;
  businessId?: string;
}) {
  const {
    businessName,
    status,
    reasons = [],
    windowStart,
    windowEnd,
    businessId,
  } = args;

  const statusLine =
    status === "attention"
      ? "Action Needed 🔴"
      : status === "softening"
      ? "Trending Down 🟠"
      : status === "watch"
      ? "Movement Detected 🟡"
      : "Stable ✅";

  const subject =
    status === "attention"
      ? `Action Needed 🔴 - ${businessName}`
      : status === "softening"
      ? `Trending Down 🟠 - ${businessName}`
      : status === "watch"
      ? `Movement Detected 🟡 - ${businessName}`
      : `Stable ✅ - ${businessName}`;

  const reasonLines =
    reasons.length > 0
      ? reasons
          .slice(0, 3)
          .map((r) => `- ${r.detail || r.code || "Signal detected"}`)
          .join("\n")
      : null;

  const detailsUrl = businessId
    ? `${baseUrl()}/alerts/${businessId}`
    : `${baseUrl()}/alerts`;

  const executivePrompt =
    status === "attention"
      ? "Executive prompt: What decision do we make in the next 24–48 hours?"
      : status === "softening"
      ? "Executive prompt: What’s the fastest intervention to stop the slide?"
      : status === "watch"
      ? "Executive prompt: Do we understand why this is trending?"
      : "Executive prompt: What are we missing?";

  const text = `
DRIFT Alert — ${statusLine}

Business: ${businessName}
Window: ${windowStart} → ${windowEnd}

${reasonLines ? `Signals:\n${reasonLines}\n` : ""}

${executivePrompt}

Open DRIFT:
${detailsUrl}

—
Short. Specific. Actionable.
`.trim();

  return { subject, text };
}

// -----------------------------------------------------
// WEEKLY PORTFOLIO PULSE
// Used by /api/jobs/weekly
// -----------------------------------------------------

export function renderWeeklyPulseEmail(args: {
  windowStart: string;
  windowEnd: string;
  businesses: Array<{
    id: string;
    name: string;
    last_drift: any | null;
  }>;
}) {
  const statuses = args.businesses.map((b) =>
    normalizeStatus(b.last_drift?.status)
  );

  const counts = statusCounts(statuses);
  const top = pickTopStatus(statuses);

  const headerLine = formatStatusLine(top);

  // Rank by severity
  const ranked = [...args.businesses].sort((a, b) => {
    const rank = (s: DriftStatus) =>
      s === "attention" ? 3 : s === "softening" ? 2 : s === "watch" ? 1 : 0;

    return (
      rank(normalizeStatus(b.last_drift?.status)) -
      rank(normalizeStatus(a.last_drift?.status))
    );
  });

  const topItems = ranked
    .filter((b) => normalizeStatus(b.last_drift?.status) !== "stable")
    .slice(0, 3)
    .map((b) => {
      const s = normalizeStatus(b.last_drift?.status);
      const reason =
        b.last_drift?.reasons?.[0]?.detail ??
        b.last_drift?.reasons?.[0]?.code ??
        "Signal detected";

      return `- ${b.name} — ${s.toUpperCase()} — ${reason}
  ${baseUrl()}/alerts/${b.id}`;
    });

  const executivePrompt =
    top === "attention"
      ? "🔴 Portfolio Risk Detected - What requires action this week?"
      : top === "softening"
      ? "🟠 Portfolio Trending Down - Where can we intervene quickly?"
      : top === "watch"
      ? "🟡 Portfolio Movement - Do we understand what’s driving these trends?"
      : "✅ Portfolio Stable - What are we missing?";

  const text = `
DRIFT Weekly Pulse — ${headerLine}

Week: ${args.windowStart} → ${args.windowEnd}
Portfolio: ${args.businesses.length} business(es)
Status mix: ${counts.attention} Attention · ${counts.softening} Softening · ${counts.watch} Watch · ${counts.stable} Stable

${executivePrompt}

${topItems.length ? `Top items:\n${topItems.join("\n")}` : "Top items: None this week."}

Open DRIFT:
${baseUrl()}/alerts

—
Short. Specific. Actionable.
`.trim();

  return { text };
}