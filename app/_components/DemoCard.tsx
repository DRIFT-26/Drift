"use client";

// app/_components/DemoCard.tsx
import { useEffect, useMemo, useState } from "react";

type DriftStatus = "stable" | "watch" | "softening" | "attention";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function statusTone(status: DriftStatus) {
  switch (status) {
    case "attention":
      return {
        label: "ACTION NEEDED",
        dot: "bg-red-400",
        pill: "bg-red-500/10 text-red-200 ring-red-500/20",
      };
    case "softening":
      return {
        label: "SOFTENING",
        dot: "bg-orange-300",
        pill: "bg-orange-500/10 text-orange-200 ring-orange-500/20",
      };
    case "watch":
      return {
        label: "WATCH",
        dot: "bg-yellow-300",
        pill: "bg-yellow-500/10 text-yellow-200 ring-yellow-500/20",
      };
    default:
      return {
        label: "STABLE",
        dot: "bg-emerald-300",
        pill: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20",
      };
  }
}

function money(cents: number) {
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function pct(p: number) {
  return `${(p * 100).toFixed(1)}%`;
}

// no "Decision prompt:" label
function decisionPrompt(status: DriftStatus) {
  switch (status) {
    case "attention":
      return "What do we change in the next 24–48 hours?";
    case "softening":
      return "What’s the fastest intervention to stop the slide?";
    case "watch":
      return "What’s driving the movement — and is it controllable?";
    default:
      return "What keeps this stable — and what would break it?";
  }
}

function previewLine(status: DriftStatus) {
  switch (status) {
    case "attention":
      return "Material Deviation Detected — Review recommended today.";
    case "softening":
      return "A drift pattern is forming — Early intervention window is open.";
    case "watch":
      return "Movement Detected — Confirm cause and direction.";
    default:
      return "Stability Confirmed — Keep the edge.";
  }
}

/**
 * Next best action — tiny but powerful.
 * This makes it feel like a control system (not a dashboard).
 */
function nextAction(status: DriftStatus) {
  switch (status) {
    case "attention":
      return "Open evidence → Identify the driver → Deploy an intervention today.";
    case "softening":
      return "Confirm the driver → Tighten the loop → Monitor the next 48 hours.";
    case "watch":
      return "Validate cause → Confirm direction → Decide if controllable.";
    default:
      return "Keep baseline stable → Watch for new movement.";
  }
}

function nextStatusTick(s: DriftStatus): DriftStatus {
  const r = Math.random();
  if (s === "attention") return r < 0.7 ? "softening" : "watch";
  if (s === "softening") return r < 0.5 ? "watch" : "stable";
  if (s === "watch") return r < 0.65 ? "stable" : r < 0.85 ? "watch" : "softening";
  return r < 0.7 ? "stable" : r < 0.9 ? "watch" : "softening";
}

type JobEvent = { t: Date; msg: string };

function makeJobEvent(status: DriftStatus): string {
  const base = [
    "Stripe ingest complete (14d)",
    "Daily compute complete",
    "Signals re-scored",
    "Baseline refreshed",
    "Refund pattern rechecked",
    "Revenue variance re-evaluated",
  ];

  const contextual =
    status === "attention"
      ? ["Alert threshold crossed", "Escalation triggered"]
      : status === "softening"
      ? ["Trend slope detected", "Deviation widening"]
      : status === "watch"
      ? ["Movement confirmed", "Change detected"]
      : ["No material deviation"];

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(base)} · ${pick(contextual)}`;
}

/**
 * Stable-ish human-readable signal ids.
 * Example: DRFT-3K9Q2
 */
function makeSignalId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "DRFT-";
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

type Confidence = "Low" | "Medium" | "High";

function confidenceFrom(status: DriftStatus, deltaPct: number): Confidence {
  // You can tune this later when you wire real stats.
  const magnitude = Math.abs(deltaPct);
  if (status === "attention") return magnitude > 0.12 ? "High" : "Medium";
  if (status === "softening") return magnitude > 0.08 ? "High" : "Medium";
  if (status === "watch") return magnitude > 0.05 ? "Medium" : "Low";
  return "High";
}

function operatorScoreFrom(
  status: DriftStatus,
  deltaPct: number,
  refundRate: number,
  baselineRefundRate: number
) {
  let score = 92;

  if (status === "attention") score -= 32;
  else if (status === "softening") score -= 18;
  else if (status === "watch") score -= 10;

  score -= Math.min(18, Math.round(Math.abs(deltaPct) * 100));
  score -= Math.min(
    10,
    Math.max(0, Math.round((refundRate - baselineRefundRate) * 200))
  );

  return clamp(score, 41, 98);
}

export default function DemoCard() {
  const [status, setStatus] = useState<DriftStatus>("watch");
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());

  // Supporting metrics (hidden by default)
  const [showDetail, setShowDetail] = useState(true);

  // Simulated signal snapshot
  const [mri, setMri] = useState(92);
  const [net14d, setNet14d] = useState(186_420); // cents
  const [baseline14d, setBaseline14d] = useState(201_900); // cents
  const [refundRate, setRefundRate] = useState(0.042);
  const [baselineRefundRate, setBaselineRefundRate] = useState(0.028);

  // Operator-grade meta
  const [signalId, setSignalId] = useState<string>(() => makeSignalId());
  const baselineWindow = "Rolling (90d)";
  const detection = "Material Deviation";

  // Background job ticker (most recent first)
  const [events, setEvents] = useState<JobEvent[]>([
    { t: new Date(), msg: "System online · Signals streaming" },
  ]);

  const tone = useMemo(() => statusTone(status), [status]);
  const deltaPct = baseline14d > 0 ? (net14d - baseline14d) / baseline14d : 0;
  const operatorScore = operatorScoreFrom(
  status,
  deltaPct,
  refundRate,
  baselineRefundRate
);

  const confidence = useMemo(
    () => confidenceFrom(status, deltaPct),
    [status, deltaPct]
  );

  const reasons = useMemo(() => {
    if (status === "attention") {
      return [
        "Refund rate is climbing vs baseline.",
        "Net revenue is deviating beyond expected range.",
        "Pattern appears persistent (not a single-day spike).",
      ];
    }
    if (status === "softening") {
      return ["Net revenue is trending below baseline.", "Refund rate is elevated vs baseline."];
    }
    if (status === "watch") {
      return ["Early movement vs baseline — confirm cause and direction."];
    }
    return ["No material deviation detected."];
  }, [status]);

  useEffect(() => {
    const t = setInterval(() => {
      setStatus((s) => {
        const next = nextStatusTick(s);

        setEvents((prev) => {
          const nextEvent: JobEvent = { t: new Date(), msg: makeJobEvent(next) };
          const merged = [nextEvent, ...prev];
          return merged.slice(0, 4);
        });

        // rotate signal id when the system transitions into a non-stable signal,
        // so it feels like distinct signals are being created
        if (next !== "stable") setSignalId(makeSignalId());

        return next;
      });

      setUpdatedAt(new Date());

      // Gentle number drift
      setMri((v) => clamp(v + Math.round((Math.random() - 0.55) * 6), 60, 100));
      setNet14d((v) => clamp(v + Math.round((Math.random() - 0.55) * 18_000), 20_000, 420_000));
      setBaseline14d((v) => clamp(v + Math.round((Math.random() - 0.5) * 10_000), 40_000, 460_000));
      setRefundRate((v) => clamp(v + (Math.random() - 0.55) * 0.01, 0, 0.25));
      setBaselineRefundRate((v) => clamp(v + (Math.random() - 0.5) * 0.004, 0, 0.2));
    }, 2200);

    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-wide text-white/60">
            CONTROL TOWER SIGNAL
          </div>

          {/* Make it a named object: DRIFT Signal */}
          <div className="mt-1 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
            <div className="text-base font-extrabold">DRIFT Signal</div>
            <span className="text-[11px] text-white/35 font-mono">#{signalId}</span>
          </div>

          <div className="mt-1 text-sm text-white/70">{previewLine(status)}</div>

          {/* Operator-grade metadata row */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/55 font-mono">
            <span className="text-white/35">Baseline:</span>{" "}
            <span className="text-white/75">{baselineWindow}</span>
            <span className="text-white/35">·</span>
            <span className="text-white/35">Detection:</span>{" "}
            <span className="text-white/75">{detection}</span>
            <span className="text-white/35">·</span>
            <span className="text-white/35">Confidence:</span>{" "}
            <span className="text-white/75">{confidence}</span>
          </div>
        </div>

        <div className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ring-1 ${tone.pill}`}>
          {tone.label}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-black/20 px-4 py-3 ring-1 ring-white/10">
  <div className="flex items-center justify-between">
    <div>
      <div className="text-[11px] font-semibold text-white/55">OPERATOR SCORE</div>
      <div className="mt-1 text-xs text-white/45">0–100 · Control Confidence</div>
    </div>

    <div className="text-3xl font-black text-white tabular-nums">
      {operatorScore}
    </div>
  </div>
</div>

      {/* Auto-update bar */}
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3 ring-1 ring-white/10">
        <div className="text-xs font-semibold text-white/70">
          DRIFT watches the signals most dashboards miss.
        </div>
        <div className="text-[11px] text-white/55">
          Updated {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Next action (NEW) */}
      <div className="mt-3 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold text-white/60">NEXT ACTION</div>
          <div className="text-[11px] text-white/45 font-mono">Operator Mode</div>
        </div>
        <div className="mt-1 text-sm text-white/80">{nextAction(status)}</div>
      </div>

      {/* Background job ticker */}
      <div className="mt-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-white/60">BACKGROUND ACTIVITY</div>
          <div className="text-[11px] text-white/50">Executive-Level · Quiet Automation</div>
        </div>

        <div className="mt-2 space-y-1.5">
          {events.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-[11px] text-white/70">
              <div className="truncate">
                <span className="mr-2 text-white/45">•</span>
                {e.msg}
              </div>
              <div className="shrink-0 text-white/40">
                {e.t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Why + prompt */}
      <div className="mt-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <div className="text-[11px] font-semibold text-white/60">WHY THIS SHOWED UP</div>
        <ul className="mt-2 space-y-2 text-sm text-white/80">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
              <span>{r}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl bg-black/20 px-3 py-2 text-sm font-semibold text-white/80 ring-1 ring-white/10">
          {decisionPrompt(status)}
        </div>

        {/* Supporting detail toggle (keeps it from feeling like a dashboard) */}
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="text-[12px] font-semibold text-white/70 hover:text-white transition"
          >
            {showDetail ? "Hide Evidence" : "Show Evidence"}
          </button>
          <div className="text-[11px] text-white/45">
            Evidence Only — the signal is the product.
          </div>
        </div>

        {showDetail ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
  <div className="rounded-2xl bg-black/20 p-4 ring-1 ring-white/10">
    <div className="text-[11px] font-semibold text-white/55">NET REV (14D)</div>
    <div className="mt-2 text-xl font-black text-white">{money(net14d)}</div>
    <div className="mt-1 text-xs text-white/45">
      Baseline {money(baseline14d)} · Δ {(deltaPct * 100).toFixed(0)}%
    </div>
  </div>

  <div className="rounded-2xl bg-black/20 p-4 ring-1 ring-white/10">
    <div className="text-[11px] font-semibold text-white/55">REFUND RATE</div>
    <div className="mt-2 text-xl font-black text-white">{pct(refundRate)}</div>
    <div className="mt-1 text-xs text-white/45">
      Baseline {pct(baselineRefundRate)}
    </div>
  </div>
</div>
        ) : null}
      </div>
    </div>
  );
}