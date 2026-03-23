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

DRIFT is now watching your revenue.

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
}: {
  businessName: string;
  status: "stable" | "watch" | "movement";
}) {
  if (status === "watch") {
    return {
      subject: `DRIFT Daily Monitor — Movement Detected 🟡 (${businessName})`,
      text: `DRIFT Daily Monitor

Business: ${businessName}

Status: MOVEMENT DETECTED 🟡

Early movement has been detected relative to baseline.

No intervention is recommended yet, but DRIFT is watching closely.

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

DRIFT is monitoring for persistence.

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

DRIFT continues monitoring performance.

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

${driftLinkBlock}
— DRIFT
Revenue control for operators
`;

  return {
    subject,
    text,
  };
}