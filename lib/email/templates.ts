type WeeklyPulseStatus = "stable" | "watch" | "softening" | "attention";

function weeklySubject(counts: {
  attention: number;
  softening: number;
  watch: number;
  stable: number;
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

  return "DRIFT Weekly Pulse — Stable ✅";
}

function weeklyPrompt(counts: {
  attention: number;
  softening: number;
  watch: number;
  stable: number;
}) {
  if (counts.attention > 0) {
    return "Prompt: What needs intervention first this week?";
  }

  if (counts.softening > 0) {
    return "Prompt: Where can we stabilize momentum before the slide continues?";
  }

  if (counts.watch > 0) {
    return "Prompt: Which early movements are worth validating now?";
  }

  return "Prompt: Stability confirmed — what’s worth a closer look to stay sharp?";
}

export type StatusEmailStatus = "stable" | "softening" | "attention";

function statusSubject(status: StatusEmailStatus, businessName: string) {
  if (status === "attention") {
    return `DRIFT — Action Needed 🔴 (${businessName})`;
  }

  if (status === "softening") {
    return `DRIFT — Trending Down 🟠 (${businessName})`;
  }

  return `DRIFT — Stable ✅ (${businessName})`;
}

function statusLabel(status: StatusEmailStatus) {
  if (status === "attention") return "ACTION NEEDED 🔴";
  if (status === "softening") return "TRENDING DOWN 🟠";
  return "STABLE ✅";
}

function statusPrompt(status: StatusEmailStatus) {
  if (status === "attention") {
    return "Prompt: What do we change in the next 24–48 hours?";
  }

  if (status === "softening") {
    return "Prompt: What’s the fastest intervention to stop the slide?";
  }

  return "Prompt: Stability confirmed — what’s worth a closer look to stay sharp?";
}

function statusImpactLine(status: StatusEmailStatus) {
  if (status === "attention") {
    return "If this trend continues, revenue performance may fall materially below baseline in the coming days.";
  }

  if (status === "softening") {
    return "If the trend continues, revenue may fall below the expected baseline for this period.";
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

  const reasonLines =
    reasons.length > 0
      ? reasons.map((reason) => `- ${reason}`).join("\n")
      : "- No material deviation detected.";

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

export function renderWeeklyPulseEmail({
  windowStart,
  windowEnd,
  businesses,
}: {
  windowStart: string;
  windowEnd: string;
  businesses: Array<{
    id: string;
    name: string;
    status: WeeklyPulseStatus;
    reason?: string | null;
  }>;
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

  const text = `DRIFT Weekly Pulse
Window: ${windowStart} → ${windowEnd}

${lines}

Summary
- Action Needed: ${counts.attention}
- Softening: ${counts.softening}
- Watch: ${counts.watch}
- Stable: ${counts.stable}

${prompt}

— DRIFT
Revenue control for operators
`;

  return {
    subject,
    text,
  };
}