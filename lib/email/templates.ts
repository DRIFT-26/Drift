export function renderStatusEmail(params: {
  businessName: string;
  status: "stable" | "softening" | "attention";
  reasons: Array<{ code: string; detail: string; delta?: number }>;
  windowStart: string;
  windowEnd: string;
}) {
  const emoji =
    params.status === "stable" ? "🟢" : params.status === "softening" ? "🟡" : "🔴";

  const subject =
    params.status === "stable"
      ? `DRIFT Check-In: Stable`
      : params.status === "softening"
      ? `DRIFT Notice: Softening`
      : `DRIFT Alert: Attention needed`;

  const lines: string[] = [];
  lines.push(`DRIFT Monitoring Update`);
  lines.push(``);
  lines.push(`Business: ${params.businessName}`);
  lines.push(`Status: ${emoji} ${params.status.toUpperCase()}`);
  lines.push(`Window: ${params.windowStart} → ${params.windowEnd}`);
  lines.push(``);

  if (params.status === "stable") {
    lines.push(`No material changes in customer trust or engagement were detected.`);
    lines.push(`We’ll continue to watch quietly and let you know if anything shifts.`);
  } else {
    lines.push(`We’ve detected meaningful movement relative to recent baselines.`);
    lines.push(`Signals contributing to this status:`);
    for (const r of params.reasons) {
      const pct =
        typeof r.delta === "number" ? ` (Δ ${Math.round(r.delta * 1000) / 10}%)` : "";
      lines.push(`• ${r.detail}${pct}`);
    }
    lines.push(``);
    lines.push(`This alert is informational. DRIFT does not assume cause — only that momentum has shifted.`);
  }

  lines.push(``);
  lines.push(`— DRIFT`);

  return { subject, text: lines.join("\n") };
}