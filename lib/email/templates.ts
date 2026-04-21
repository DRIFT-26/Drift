type WeeklyPulseStatus =
  | "stable"
  | "movement"
  | "watch"
  | "softening"
  | "attention";

export type StatusEmailStatus =
  | "stable"
  | "movement"
  | "watch"
  | "softening"
  | "attention";

function getDaysRemaining(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;

  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  const diff = end - now;

  if (diff <= 0) return 0;

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function weeklySubject(counts: {
  attention: number;
  softening: number;
  watch: number;
  stable: number;
  movement: number;
}) {
  if (counts.attention > 0) {
    return `DRIFT Weekly Pulse — ${counts.attention} require review 🔴`;
  }

  if (counts.softening > 0) {
    return `DRIFT Weekly Pulse — Softening detected 🟠`;
  }

  if (counts.watch > 0) {
    return `DRIFT Weekly Pulse — Watch list updated 🟡`;
  }

  if (counts.movement > 0) {
    return `DRIFT Weekly Pulse — Momentum detected 🔵`;
  }

  return "DRIFT Weekly Pulse — Stable ✅";
}

function weeklyPrompt(counts: {
  attention: number;
  softening: number;
  watch: number;
  stable: number;
  movement: number;
}) {
  if (counts.attention > 0) {
    return "What needs intervention first this week?";
  }

  if (counts.softening > 0) {
    return "Where can we stabilize momentum before the slide continues?";
  }

  if (counts.watch > 0) {
    return "Which early movements are worth validating now?";
  }

  if (counts.movement > 0) {
    return "What is driving this acceleration — and is it repeatable?";
  }

  return "Stability confirmed — what’s worth a closer look to stay sharp?";
}

function statusSubject(status: StatusEmailStatus, businessName: string) {
  if (status === "attention") {
    return `DRIFT — Action Needed 🔴 (${businessName})`;
  }

  if (status === "softening") {
    return `DRIFT — Trending Down 🟠 (${businessName})`;
  }

  if (status === "watch") {
    return `DRIFT — Movement Detected 🟡 (${businessName})`;
  }

  if (status === "movement") {
    return `DRIFT — Momentum Detected 🔵 (${businessName})`;
  }

  return `DRIFT — Stable ✅ (${businessName})`;
}

function statusLabel(status: StatusEmailStatus) {
  if (status === "attention") return "ACTION NEEDED 🔴";
  if (status === "softening") return "TRENDING DOWN 🟠";
  if (status === "watch") return "MOVEMENT DETECTED 🟡";
  if (status === "movement") return "MOMENTUM DETECTED 🔵";
  return "STABLE ✅";
}

function statusPrompt(status: StatusEmailStatus) {
  if (status === "attention") {
    return "What do we change in the next 24–48 hours?";
  }

  if (status === "softening") {
    return "What’s the fastest intervention to stop the slide?";
  }

  if (status === "watch") {
    return "What early movement is worth validating now?";
  }

  if (status === "movement") {
    return "What is driving this acceleration — and is it repeatable?";
  }

  return "Stability Confirmed — What’s worth a closer look to stay sharp?";
}

function statusImpactLine(status: StatusEmailStatus) {
  if (status === "attention") {
    return "If this trend continues, revenue performance may fall materially below baseline in the coming days.";
  }

  if (status === "softening") {
    return "If the trend continues, revenue may fall below the expected baseline for this period.";
  }

  if (status === "watch") {
    return "Early movement has been detected. If it persists, it may begin to affect near-term revenue performance.";
  }

  if (status === "movement") {
    return "If this momentum continues, revenue may outperform the expected baseline for this period.";
  }

  return null;
}

export function renderStatusEmail({
  businessName,
  status,
  reasons,
  windowStart,
  windowEnd,
  shareUrl,
}: {
  businessName: string;
  status: StatusEmailStatus;
  reasons: string[];
  windowStart: string;
  windowEnd: string;
  shareUrl?: string;
}) {
  const subject = statusSubject(status, businessName);
  const statusLine = statusLabel(status);
  const prompt = statusPrompt(status);
  const impactLine = statusImpactLine(status);

  const uniqueReasons = [...new Set((reasons || []).filter(Boolean))];

  const reasonLines = uniqueReasons.length
    ? uniqueReasons.map((r) => `- ${r}`).join("\n")
    : "- No additional signal details available.";

  const shareBlock = shareUrl
    ? `

View this signal:
${shareUrl}

Forwardable by design.`
    : "";

  const text = `DRIFT Signal — ${statusLine}

Business: ${businessName}
Window: ${windowStart} → ${windowEnd}

WHY THIS SHOWED UP
${reasonLines}

${impactLine ? `${impactLine}

` : ""}${prompt}${shareBlock}

— DRIFT
Revenue control for operators
`;

  return {
    subject,
    text,
  };
}

export function renderMonitoringStartedEmail({
  businessName,
  source,
}: {
  businessName: string;
  source: string;
}) {
  const subject = "DRIFT — Monitoring Started";

  const text = `DRIFT Monitoring Started

Business: ${businessName}
Source Connected: ${source}

DRIFT is now tracking your revenue in real time.

The system will quietly monitor revenue patterns and notify you only when something materially changes.

No dashboards to check.
No reports to run.

You'll hear from DRIFT when it matters.

— DRIFT
Revenue control for operators
`;

  return { subject, text };
}

export function renderDailyMonitorEmail({
  businessName,
  status,
  shareUrl,
}: {
  businessName: string;
  status: "stable" | "watch" | "movement";
  shareUrl?: string;
}) {
  const shareBlock = shareUrl
    ? `

View this signal:
${shareUrl}

Forwardable by design.`
    : "";

  if (status === "watch") {
    return {
      subject: `DRIFT Daily Monitor — Movement Detected 🟡 (${businessName})`,
      text: `DRIFT Daily Monitor

Business: ${businessName}

Status: MOVEMENT DETECTED 🟡

Early movement has been detected relative to baseline.

No intervention is recommended yet, but DRIFT is watching closely.${shareBlock}

— DRIFT
Revenue control for operators`,
    };
  }

  if (status === "movement") {
    return {
      subject: `DRIFT Daily Monitor — Momentum Detected 🔵 (${businessName})`,
      text: `DRIFT Daily Monitor

Business: ${businessName}

Status: MOMENTUM DETECTED 🔵

Revenue is trending above the expected baseline.

DRIFT is monitoring for persistence.${shareBlock}

— DRIFT
Revenue control for operators`,
    };
  }

  return {
    subject: `DRIFT Daily Monitor — Stable ✅ (${businessName})`,
    text: `DRIFT Daily Monitor

Business: ${businessName}

Status: STABLE ✅

Revenue is tracking within the expected baseline range.

DRIFT continues monitoring performance.${shareBlock}

— DRIFT
Revenue control for operators`,
  };
}

export function renderWeeklyPulseEmail({
  windowStart,
  windowEnd,
  businesses,
  billingStatus,
  trialEndsAt,
  openDriftUrl,
}: {
  windowStart: string;
  windowEnd: string;
  businesses: Array<{
    id: string;
    name: string;
    status: WeeklyPulseStatus;
    reason?: string | null;
  }>;
  billingStatus?: string | null;
  trialEndsAt?: string | null;
  openDriftUrl?: string;
}) {
  const counts = businesses.reduce(
    (acc, business) => {
      acc[business.status] += 1;
      return acc;
    },
    {
      attention: 0,
      softening: 0,
      watch: 0,
      stable: 0,
      movement: 0,
    } as Record<WeeklyPulseStatus, number>
  );

  const subject = weeklySubject(counts);
  const prompt = weeklyPrompt(counts);

  const lines =
    businesses.length > 0
      ? businesses
          .map((business) => {
            const reasonPart = business.reason ? ` — ${business.reason}` : "";
            return `- ${business.name} — ${business.status.toUpperCase()}${reasonPart}`;
          })
          .join("\n")
      : "- No businesses included in this pulse.";

  let trialBlock = "";

  if (billingStatus === "trialing") {
    const daysRemaining = getDaysRemaining(trialEndsAt);

    if (daysRemaining !== null) {
      if (daysRemaining > 7) {
        trialBlock = `
DRIFT Trial Status
- ${daysRemaining} days remaining
- Monitoring active. No action required.
`;
      } else if (daysRemaining > 0) {
        trialBlock = `
DRIFT Trial Status
- ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining
- Monitoring remains active. Upgrade to maintain uninterrupted signal coverage.
`;
      } else {
        trialBlock = `
DRIFT Trial Status
- Expired
- Monitoring paused. Upgrade to restore signal coverage.
`;
      }
    }
  }

const driftLinkBlock = openDriftUrl
  ? `
Open DRIFT
${openDriftUrl}
`
  : "";

const monitoringFooter =
  billingStatus === "active" || billingStatus === "trialing"
    ? `Monitoring remains active. No action required.

`
    : "";  

const text = `DRIFT Weekly Pulse
Window: ${windowStart} → ${windowEnd}

${lines}

Summary
- Action Needed: ${counts.attention}
- Softening: ${counts.softening}
- Watch: ${counts.watch}
- Momentum: ${counts.movement}
- Stable: ${counts.stable}

${trialBlock ? `${trialBlock}
` : ""}${prompt}

${monitoringFooter}${driftLinkBlock}
— DRIFT
Revenue control for operators
`;

  return {
    subject,
    text,
  };
}

export function renderTrialLifecycleEmail({
  businessName,
  daysRemaining,
  upgradeUrl,
}: {
  businessName: string;
  daysRemaining: number;
  upgradeUrl?: string;
}) {
  const subject =
    daysRemaining > 0
      ? `DRIFT Trial Status — ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
      : "DRIFT Trial Status — Expired";

  const statusLine =
  daysRemaining > 0
    ? `Monitoring remains active — DRIFT is tracking your revenue in real time for ${daysRemaining} more day${daysRemaining === 1 ? "" : "s"}.`
    : "Monitoring is now paused.";

  const actionLine =
    daysRemaining > 0
      ? "Upgrade to maintain uninterrupted signal coverage."
      : "Upgrade to restore signal coverage.";

  const upgradeBlock = upgradeUrl
    ? `

Upgrade DRIFT:
${upgradeUrl}`
    : "";

  const text = `DRIFT Trial Status

Business: ${businessName}

${statusLine}
${actionLine}${upgradeBlock}

— DRIFT
Revenue control for operators
`;

  return { subject, text };
}

export function renderTrialExpiredDay0Email(args: {
  businessName: string;
  upgradeUrl: string;
}) {
  const subject = `DRIFT paused — your signals haven’t (${args.businessName})`;

  const text = `During your trial, DRIFT was actively monitoring your revenue behavior and detecting changes as they happened.

That monitoring has now paused.

What this means:

- Signals may still be forming
- Early changes won’t be surfaced
- Intervention may happen later than it should

DRIFT isn’t a dashboard — it’s a system that tells you when something changes.

Activate DRIFT:
${args.upgradeUrl}

— DRIFT`;

  return { subject, text };
}

export function renderTrialExpiredDay2Email(args: {
  businessName: string;
  upgradeUrl: string;
}) {
  const subject = `You had visibility. It’s paused now. (${args.businessName})`;

  const text = `Just a quick note—

DRIFT is no longer actively monitoring your portfolio.

The signals you saw during your trial don’t stop existing.
You just stop seeing them.

If staying ahead of changes matters, reactivate here:

${args.upgradeUrl}

— DRIFT`;

  return { subject, text };
}

export function renderTrialExpiredDay5Email(args: {
  businessName: string;
  upgradeUrl: string;
}) {
  const subject = `Before something slips (${args.businessName})`;

  const text = `Last note from us.

Most revenue issues don’t happen all at once — they develop quietly.

That’s exactly what DRIFT is built to catch.

If you want to stay ahead of what’s changing:

${args.upgradeUrl}

— DRIFT`;

  return { subject, text };
}

type WeeklyBriefingStatus =
  | "stable"
  | "watch"
  | "softening"
  | "attention"
  | "movement";

type WeeklyBriefingParams = {
  portfolioName: string;
  status: WeeklyBriefingStatus;
  counts: {
    total: number;
    stable: number;
    watch: number;
    softening: number;
    attention: number;
    movement: number;
  };
  watchout: string;
  openDriftUrl?: string;
};

function weeklyBriefingSubject({
  status,
  portfolioName,
}: {
  status: WeeklyBriefingStatus;
  portfolioName: string;
}) {
  if (status === "attention") {
    return `DRIFT Weekly Briefing — Action needed (${portfolioName})`;
  }

  if (status === "softening") {
    return `DRIFT Weekly Briefing — Revenue softened (${portfolioName})`;
  }

  if (status === "watch") {
    return `DRIFT Weekly Briefing — Early movement detected (${portfolioName})`;
  }

  if (status === "movement") {
    return `DRIFT Weekly Briefing — Momentum detected (${portfolioName})`;
  }

  return `DRIFT Weekly Briefing — Your week was stable (${portfolioName})`;
}

function weeklyBriefingOpening(status: WeeklyBriefingStatus) {
  if (status === "attention") {
    return "Material change was detected this past week. DRIFT surfaced conditions that need immediate attention.";
  }

  if (status === "softening") {
    return "This past week showed measurable softening against baseline. Nothing catastrophic, but enough movement to warrant a closer look.";
  }

  if (status === "watch") {
    return "This past week showed early movement against baseline. It has not escalated, but it is worth keeping an eye on.";
  }

  if (status === "movement") {
    return "This past week showed positive momentum beyond expected range. DRIFT detected performance moving above baseline.";
  }

  return "This past week held steady. No material deviation was detected.";
}

function weeklyBriefingWatched(status: WeeklyBriefingStatus) {
  if (status === "attention") {
    return "DRIFT monitored your revenue behavior across the week and flagged conditions that moved beyond expected operating range.";
  }

  if (status === "softening") {
    return "DRIFT monitored your revenue behavior across the week and detected softening relative to your recent baseline.";
  }

  if (status === "watch") {
    return "DRIFT monitored your revenue behavior across the week and picked up early movement that stayed below more serious thresholds.";
  }

  if (status === "movement") {
    return "DRIFT monitored your revenue behavior across the week and detected upside movement that exceeded the expected range.";
  }

  return "DRIFT monitored your revenue behavior across the week, watching for early deviation against baseline. Everything remained within expected range.";
}

function weeklyBriefingWithinRange(counts: WeeklyBriefingParams["counts"]) {
  const lines: string[] = [];

  if (counts.attention === 0) {
    lines.push("No immediate attention signals were triggered.");
  }

  if (counts.softening === 0) {
    lines.push("No softening conditions crossed threshold.");
  }

  if (counts.watch === 0) {
    lines.push("No early warning conditions moved into Watch.");
  }

  if (counts.movement === 0) {
    lines.push("No unusual upside movement moved beyond expected range.");
  }

  if (lines.length === 0) {
    lines.push("This week produced meaningful movement worth reviewing more closely.");
  }

  return lines;
}

function weeklyBriefingForwardClose(status: WeeklyBriefingStatus) {
  if (status === "attention") {
    return "DRIFT will continue monitoring closely and will surface any additional change the moment it matters.";
  }

  if (status === "softening") {
    return "DRIFT will continue monitoring for further deterioration or signs of stabilization heading into the new week.";
  }

  if (status === "watch") {
    return "DRIFT will continue monitoring to see whether this early movement settles or develops into a stronger signal.";
  }

  if (status === "movement") {
    return "DRIFT will continue monitoring to see whether this momentum holds or settles back toward baseline.";
  }

  return "DRIFT will continue monitoring for any meaningful change and will surface it the moment it matters.";
}

export function renderWeeklyBriefingEmail({
  portfolioName,
  status,
  counts,
  watchout,
  openDriftUrl,
}: WeeklyBriefingParams) {
  const subject = weeklyBriefingSubject({ status, portfolioName });
  const opening = weeklyBriefingOpening(status);
  const watched = weeklyBriefingWatched(status);
  const withinRange = weeklyBriefingWithinRange(counts);
  const close = weeklyBriefingForwardClose(status);

  const text = [
    opening,
    "",
    watched,
    "",
    "What stayed within range:",
    ...withinRange.map((line) => `- ${line}`),
    "",
    "One thing to watch heading into this week:",
    watchout,
    "",
    close,
    "",
    ...(openDriftUrl ? ["", `Open DRIFT: ${openDriftUrl}`] : []),
  ].join("\n");

  return { subject, text };
}