import { createClient } from "@supabase/supabase-js";

type AlertRow = {
  status: string | null;
  reasons: string[] | null;
  created_at: string | null;
  business_id: string;
  share_expires_at: string | null;
};

function statusLabel(status: string | null | undefined) {
  if (status === "attention") return "ACTION NEEDED 🔴";
  if (status === "softening") return "TRENDING DOWN 🟠";
  if (status === "watch") return "MOVEMENT DETECTED 🟡";
  return "STABLE ✅";
}

function statusTone(status: string | null | undefined) {
  if (status === "attention") {
    return {
      dot: "bg-red-400",
      pill: "bg-red-500/10 text-red-200 ring-red-500/20",
      preview: "Material deviation detected — review recommended today.",
      next: "Open evidence → identify the driver → deploy an intervention today.",
    };
  }

  if (status === "softening") {
    return {
      dot: "bg-orange-300",
      pill: "bg-orange-500/10 text-orange-200 ring-orange-500/20",
      preview: "A drift pattern is forming — early intervention window is open.",
      next: "Confirm the driver → tighten the loop → monitor the next 48 hours.",
    };
  }

  if (status === "watch") {
    return {
      dot: "bg-yellow-300",
      pill: "bg-yellow-500/10 text-yellow-200 ring-yellow-500/20",
      preview: "Movement detected — confirm cause and direction.",
      next: "Validate cause → confirm direction → decide if controllable.",
    };
  }

  return {
    dot: "bg-emerald-300",
    pill: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20",
    preview: "Stability confirmed — keep the edge.",
    next: "Keep baseline stable → watch for new movement.",
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";

  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
          <h1 className="mt-3 text-2xl font-semibold">Signal not found</h1>
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
          <h1 className="mt-3 text-2xl font-semibold">Signal expired</h1>
          <p className="mt-3 text-sm text-white/60">
            Ask the sender to generate a fresh signal link.
          </p>
        </div>
      </main>
    );
  }

  const tone = statusTone(alert.status);
  const reasons = Array.isArray(alert.reasons) ? alert.reasons : [];

  return (
    <main className="min-h-screen bg-[#0B1220] px-6 py-20 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold tracking-wide text-white/45">
                DRIFT SIGNAL PREVIEW
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                <div className="text-lg font-extrabold">DRIFT Signal</div>
              </div>

              <div className="mt-2 text-sm text-white/70">{tone.preview}</div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono text-white/55">
                <span className="text-white/35">created:</span>
                <span className="text-white/75">{formatDateTime(alert.created_at)}</span>
                <span className="text-white/35">·</span>
                <span className="text-white/35">detection:</span>
                <span className="text-white/75">material deviation</span>
                <span className="text-white/35">·</span>
                <span className="text-white/35">delivery:</span>
                <span className="text-white/75">forwarded signal</span>
              </div>
            </div>

            <div
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ring-1 ${tone.pill}`}
            >
              {statusLabel(alert.status)}
            </div>
          </div>

          {/* Why this showed up */}
          <div className="mt-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-[11px] font-semibold text-white/60">
              WHY THIS SHOWED UP
            </div>

            <ul className="mt-3 space-y-2 text-sm text-white/80">
              {(reasons.length ? reasons : ["No material deviation details available."])
                .slice(0, 4)
                .map((reason, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
                    <span>{reason}</span>
                  </li>
                ))}
            </ul>
          </div>

          {/* Next action */}
          <div className="mt-4 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold text-white/60">
                NEXT ACTION
              </div>
              <div className="text-[11px] font-mono text-white/45">
                operator mode
              </div>
            </div>
            <div className="mt-1 text-sm text-white/80">{tone.next}</div>
          </div>

          {/* CTA */}
          <div className="mt-6 rounded-2xl bg-black/20 p-5 ring-1 ring-white/10">
            <div className="text-xs font-mono tracking-wide text-white/45">
              GET DRIFT FOR YOUR BUSINESS
            </div>

            <h2 className="mt-2 text-lg font-semibold">
              Your revenue should never surprise you.
            </h2>

            <p className="mt-2 text-sm text-white/70">
              DRIFT is a revenue control layer that detects material deviation
              before it becomes visible in dashboards or on your P&amp;L.
            </p>

            <p className="mt-3 text-xs text-white/50">
              Stripe or CSV supported · Limited Founding Cohort
            </p>

            <a
              href="/onboard"
              className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[#0A2A66] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F]"
            >
              Join the Founding Cohort
            </a>

            <div className="mt-3 text-center text-xs text-white/45">
              Takes ~30 seconds · No commitment required
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}