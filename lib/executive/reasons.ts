export function formatReason(r: any): string {
  const code = String(r?.code ?? "");

  switch (code) {
    case "REV_FREQ_DROP_30":
      return "Review frequency down 30%+";

    case "ENG_DROP_30":
      return "Engagement down 30%+";

    case "SENTIMENT_DROP_50":
      return "Customer sentiment declining";

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