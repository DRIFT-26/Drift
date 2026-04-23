"use client";

import { useEffect, useMemo, useState } from "react";

type Tick = {
  t: string;
  msg: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function nowStamp() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export default function JobTicker() {
  const seed = useMemo<Tick[]>(
    () => [
      { t: nowStamp(), msg: "Ingest: queued (14d)" },
      { t: nowStamp(), msg: "Compute: scheduled" },
      { t: nowStamp(), msg: "Alerts: standing by" },
    ],
    []
  );

  const [ticks, setTicks] = useState<Tick[]>(seed);

  useEffect(() => {
    const events = [
      "Ingest: Stripe sync complete",
      "Compute: Baseline checked",
      "Compute: Drift evaluated",
      "Alerts: No change",
      "Alerts: Signal detected",
      "Snapshots: Window updated",
    ];

    const interval = setInterval(() => {
      const msg = events[Math.floor(Math.random() * events.length)];
      const next: Tick = { t: nowStamp(), msg };
      setTicks((prev) => [next, ...prev].slice(0, 4));
    }, 3800);

    return () => clearInterval(interval);
  }, []);

  const latest = ticks[0];

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="truncate whitespace-nowrap text-xs font-mono tabular-nums text-white/55">
        <span className="text-white/35">job</span>{" "}
        <span className="text-white/45">{latest.t}</span>{" "}
        <span className="text-white/70">{latest.msg}</span>
      </div>
    </div>
  );
}