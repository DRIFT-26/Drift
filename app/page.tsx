"use client";

import DemoCard from "@/app/_components/DemoCard";
import { useEffect, useMemo, useState } from "react";

type Tick = { t: string; msg: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function JobTicker() {
  const seed = useMemo<Tick[]>(
    () => [
      { t: nowStamp(), msg: "ingest: queued (14d)" },
      { t: nowStamp(), msg: "compute: scheduled" },
      { t: nowStamp(), msg: "alerts: standing by" },
    ],
    []
  );

  const [ticks, setTicks] = useState<Tick[]>(seed);

  useEffect(() => {
    const events = [
      "ingest: Stripe sync complete",
      "compute: baseline checked",
      "compute: drift evaluated",
      "alerts: no change",
      "alerts: signal detected",
      "snapshots: window updated",
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
    <span className="text-xs text-white/55 font-mono">
      <span className="text-white/35">DRIFT</span>{" "}
      <span className="text-white/45">{latest.t}</span>{" "}
      <span className="text-white/70">{latest.msg}</span>
    </span>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      {/* Hero Section */}
      <section className="mx-auto max-w-5xl px-6 pt-28 pb-20 text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          Know The Moment Revenue Shifts.
        </h1>

        <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
          DRIFT is a revenue control layer that detects material deviation before it becomes visible
          in your dashboards and on your P&L.
        </p>

        <p className="mt-4 text-sm text-white/60 max-w-2xl mx-auto">
          If revenue moves materially, DRIFT tells you what changed.
        </p>

        <p className="mt-2 text-xs text-white/45 max-w-2xl mx-auto">
          Built for operators who run the business by the numbers.
        </p>

        {/* CTA */}
        <div className="mt-10 flex justify-center">
          <a
            href="#demo"
            className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-6 py-3 text-sm font-semibold text-white hover:bg-[#09306F] transition shadow-[0_10px_30px_rgba(10,42,102,0.35)]"
          >
            See what DRIFT looks like
          </a>
        </div>

        {/* Founding Cohort Line */}
        <div className="mt-3 text-xs text-white/55">
          Limited Founding Cohort — 10 companies
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="mx-auto max-w-4xl px-6 pb-28">
        {/* Live System Preview */}
        <div className="text-sm text-white/65 mb-4 flex flex-wrap items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Live system preview · DRIFT processing revenue signals</span>

          {/* Tiny background job ticker */}
          <span className="text-white/35">·</span>
          <JobTicker />
        </div>

        <DemoCard />

{/* Request Access CTA */}
<div className="mt-10 flex flex-col items-center">
  <a
    href="/onboard"
    className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-6 py-3 text-sm font-semibold text-white hover:bg-[#09306F] transition shadow-[0_10px_30px_rgba(10,42,102,0.35)]"
  >
    Join the Founding Cohort
  </a>

  <p className="mt-2 text-xs text-white/50">
    Takes ~60 seconds · No commitment required
  </p>
</div>

<div className="mt-3 text-center text-xs text-white/55">
  Founding Cohort · Limited to 10 companies
</div>
      </section>
    </main>
  );
}