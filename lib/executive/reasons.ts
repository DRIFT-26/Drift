export function formatReason(r: any): string {
  const code = String(r?.code ?? "");

  switch (code) {
    case "REV_FREQ_DROP_30":
  return "Review activity is materially below baseline";

case "ENG_DROP_30":
  return "Engagement is trending below expected range";

case "SENTIMENT_DROP_50":
  return "Customer sentiment is deteriorating";

    default:
      // fallback to best available human-readable value
      return (
        r?.label ||
        r?.message ||
        r?.reason ||
        "Signal detected"
      );
  }
}