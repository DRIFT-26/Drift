import { createClient } from "@supabase/supabase-js";

type AlertStatus = "stable" | "movement" | "watch" | "softening" | "attention";

type AlertRow = {
  status: string | null;
  reasons: unknown;
  created_at: string | null;
  business_id: string;
  share_expires_at: string | null;
};

function normalizeStatus(status: string | null | undefined): AlertStatus {
  if (
    status === "stable" ||
    status === "movement" ||
    status === "watch" ||
    status === "softening" ||
    status === "attention"
  ) {
    return status;
  }

  return "stable";
}

function statusLabel(status: AlertStatus) {
  if (status === "attention") return "ACTION NEEDED 🔴";
  if (status === "softening") return "TRENDING DOWN 🟠";
  if (status === "watch") return "MOVEMENT DETECTED 🟡";
  if (status === "movement") return "MOMENTUM DETECTED 🔵";
  return "STABLE ✅";
}

function statusTone(status: AlertStatus) {
  if (status === "attention") {
    return {
      dot: "bg-red-400",
      pill: "bg-red-500/10 text-red-200 ring-red-500/20",
      preview: "Material deviation detected — Review recommended today.",
      next: "Open Evidence → Identify the driver → Deploy an intervention today.",
    };
  }

  if (status === "softening") {
    return {
      dot: "bg-orange-300",
      pill: "bg-orange-500/10 text-orange-200 ring-orange-500/20",
      preview: "A drift pattern is forming — early intervention window is open.",
      next: "Confirm the driver → Tighten the loop → Monitor the next 48 hours.",
    };
  }

  if (status === "watch") {
    return {
      dot: "bg-yellow-300",
      pill: "bg-yellow-500/10 text-yellow-200 ring-yellow-500/20",
      preview: "Movement Detected — Confirm cause and direction.",
      next: "Validate cause → Confirm direction → Decide if controllable.",
    };
  }

  if (status === "movement") {
    return {
      dot: "bg-sky-400",
      pill: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
      preview: "Revenue is accelerating beyond expected baseline behavior.",
      next: "Validate the driver → Determine if momentum is repeatable.",
    };
  }

  return {
    dot: "bg-emerald-300",
    pill: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20",
    preview: "Stability confirmed — Keep the edge.",
    next: "Keep baseline stable → Watch for new movement.",
  };
}

function formatDateTime(value: string | null, timezone?: string) {
  if (!value) return "Unknown";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";

  try {
    return d.toLocaleString("en-US", {
      timeZone: timezone || "UTC",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

function normalizeReasons(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) return [];

  return reasons
    .map((reason) => {
      if (typeof reason === "string") return reason;

      if (reason && typeof reason === "object") {
        const r = reason as Record<string, unknown>;
        if (typeof r.message === "string") return r.message;
        if (typeof r.label === "string") return r.label;
        if (typeof r.reason === "string") return r.reason;
      }

      return null;
    })
    .filter((r): r is string => Boolean(r));
}

function fallbackWhatChanged(status: AlertStatus): string[] {
  if (status === "attention") {
    return [
      "Revenue materially outside expected baseline.",
      "Deviation appears persistent across recent observations.",
    ];
  }

  if (status === "softening") {
    return [
      "Revenue trending below expected baseline.",
      "Movement appears directional rather than temporary.",
    ];
  }

  if (status === "watch") {
    return [
      "Early movement detected relative to baseline.",
      "Trend direction is still forming.",
    ];
  }

  if (status === "movement") {
    return [
      "Revenue is above expected baseline behavior.",
      "Momentum is accelerating beyond the normal range.",
    ];
  }

  return ["No material deviation detected."];
}

export default async function SignalPreview({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: alert, error } = await supabase
    .from("alerts")
    .select("status, reasons, created_at, business_id, share_expires_at")
    .eq("share_token", token)
    .single<AlertRow>();

  if (error || !alert) {
    return (
      <main className="min-h-screen bg-[#0B1220] px-6 py-20 text-white">
        <div className="mx-auto max-w-xl text-center">
          <div className="text-xs font-mono tracking-wide text-white/45">
            DRIFT SIGNAL PREVIEW
          </div>
          <h1 className="mt-3 text-2xl font-semibold">Signal Not Found</h1>
          <p className="mt-3 text-sm text-white/60">
            This signal may have expired or the link is invalid.
          </p>
        </div>
      </main>
    );
  }

  const expired =
    !!alert.share_expires_at &&
    new Date(alert.share_expires_at).getTime() < Date.now();

  if (expired) {
    return (
      <main className="min-h-screen bg-[#0B1220] px-6 py-20 text-white">
        <div className="mx-auto max-w-xl text-center">
          <div className="text-xs font-mono tracking-wide text-white/45">
            DRIFT SIGNAL PREVIEW
          </div>
          <h1 className="mt-3 text-2xl font-semibold">Signal Expired</h1>
          <p className="mt-3 text-sm text-white/60">
            Ask the sender to generate a fresh signal link.
          </p>
        </div>
      </main>
    );
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("timezone")
    .eq("id", alert.business_id)
    .maybeSingle();

  const status = normalizeStatus(alert.status);
  const tone = statusTone(status);
  const reasons = normalizeReasons(alert.reasons);
  const whatChanged = reasons.length > 0 ? [...new Set(reasons)] : fallbackWhatChanged(status);
  const businessTimezone = business?.timezone ?? "UTC";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://drifthq.co";
  const shareUrl = `${baseUrl}/s/${token}`;

  return (
    <main className="min-h-screen bg-[#0B1220] px-6 py-20 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold tracking-wide text-white/45">
                DRIFT SIGNAL PREVIEW
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                <div className="text-lg font-extrabold">DRIFT Signal</div>
              </div>

              <div className="mt-2 text-[10px] font-mono tracking-wide text-white/40">
                Signal Ref: DRFT-{alert.business_id.slice(0, 4).toUpperCase()}
              </div>

              <div className="mt-2 flex items-center gap-2 font-mono text-xs text-white/60">
                <span className="text-white/40">Signal Confidence:</span>
                <span className="text-emerald-300">HIGH</span>
              </div>

              <div className="mt-1 text-[11px] font-mono text-white/45">
                Based on rolling baseline model
              </div>

              <div className="mt-2 text-sm text-white/70">{tone.preview}</div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono tracking-wide text-white/55 md:flex-nowrap md:gap-4">
                <span className="whitespace-nowrap">
                  <span className="text-white/35">Created:</span>{" "}
                  <span className="text-white/75">
                    {formatDateTime(alert.created_at, businessTimezone)}
                  </span>
                </span>

                <span className="whitespace-nowrap">
                  <span className="text-white/35">Detection:</span>{" "}
                  <span className="text-white/75">Material Deviation</span>
                </span>

                <span className="whitespace-nowrap">
                  <span className="text-white/35">Delivery:</span>{" "}
                  <span className="text-white/75">Forwarded Signal</span>
                </span>
              </div>
            </div>

            <div
              className={`inline-flex shrink-0 self-start rounded-full px-2.5 py-1 text-[10px] font-black ring-1 sm:text-[11px] ${tone.pill}`}
            >
              {statusLabel(status)}
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="text-[11px] font-semibold text-white/60">
                WHAT CHANGED
              </div>
              <div className="text-[10px] font-mono tracking-wide text-white/40">
                Control Output
              </div>
            </div>

            <ul className="mt-3 space-y-2 text-sm text-white/80">
              {whatChanged.slice(0, 4).map((reason, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 rounded-xl bg-black/20 px-3 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10">
              If this continues, it may begin to materially affect near-term revenue performance.
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold text-white/60">
                NEXT ACTION
              </div>
              <div className="text-[11px] font-mono text-white/45">
                Operator Mode
              </div>
            </div>
            <div className="mt-1 text-sm text-white/80">{tone.next}</div>
          </div>

          <div className="mt-6 border-t border-white/10 pt-4">
            <div className="text-xs font-mono text-white/50">SHARE THIS SIGNAL</div>

            <div className="mt-3 flex flex-wrap gap-3">
              <a
                href={shareUrl}
                className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/80 transition hover:bg-white/10"
              >
                Copy Signal Link
              </a>

              <a
                href={`mailto:?subject=DRIFT Signal&body=${encodeURIComponent(shareUrl)}`}
                className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/80 transition hover:bg-white/10"
              >
                Forward via Email
              </a>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-black/20 p-5 ring-1 ring-white/10">
            <div className="text-xs font-mono tracking-wide text-white/45">
              GET DRIFT FOR YOUR BUSINESS
            </div>

            <h2 className="mt-2 text-lg font-semibold">
              Your revenue should never surprise you.
            </h2>

            <p className="mt-2 text-sm text-white/65">
              DRIFT is the control layer for revenue operations. It detects
              material deviation before it becomes visible in dashboards or on
              your P&amp;L.
            </p>

            <p className="mt-3 text-xs text-white/50">
              Stripe, Google Sheets, or CSV supported · Limited Founding Cohort
            </p>

            <a
              href="/onboard"
              className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[#0A2A66] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F]"
            >
              Join the Founding Cohort
            </a>

            <div className="mt-3 text-center text-xs text-white/45">
              Forwarded by an operator using DRIFT
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}