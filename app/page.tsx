"use client";

import DemoCard from "@/app/_components/DemoCard";
import OperatorFitSection from "@/app/_components/OperatorFitSection";
import HowOperatorsUseDrift from "@/app/_components/HowOperatorsUseDrift";
import LandingAccountActions from "@/app/_components/LandingAccountActions";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Tick = { t: string; msg: string };

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
      { t: nowStamp(), msg: "Ingest: Queued (14d)" },
      { t: nowStamp(), msg: "Compute: Scheduled" },
      { t: nowStamp(), msg: "Alerts: Standing By" },
    ],
    []
  );

  const [ticks, setTicks] = useState<Tick[]>(seed);

  useEffect(() => {
    const events = [
      "Revenue Ingest Complete",
      "Baseline Model Refreshed",
      "Revenue Signal Evaluated",
      "Material Deviation Scan Complete",
      "Momentum Check Complete",
      "Signal Dispatch Window Open",
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
      <div className="truncate whitespace-nowrap font-mono text-xs tabular-nums text-white/55">
        <span className="text-white/35">DRIFT</span>{" "}
        <span className="text-white/45">{latest.t}</span>{" "}
        <span className="text-white/35">·</span>{" "}
        <span className="text-white/70">{latest.msg}</span>{" "}
        <span className="text-white/35">·</span>{" "}
        <span className="text-white/70">Confidence: High</span>
      </div>
    </div>
  );
}

function MondayBriefingSample() {
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-[#0F172A] shadow-[0_12px_40px_rgba(0,0,0,0.24)] overflow-hidden">
      <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-white/45">
              SAMPLE MONDAY BRIEFING
            </div>
            <div className="mt-2 text-sm font-semibold text-white">
              DRIFT Weekly Briefing — Your week was stable. One thing to watch.
            </div>
          </div>
          <div className="text-xs text-white/40">Mon 8:02 AM</div>
        </div>

        <div className="mt-2 text-xs text-white/50">From: DRIFT</div>
      </div>

      <div className="px-5 py-5 text-sm leading-7 text-white/80">
        <p>This past week held steady. No material deviation was detected.</p>

        <p className="mt-4">
          DRIFT monitored your revenue behavior across the week and everything
          remained within expected range.
        </p>

        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs font-mono text-white/45">
            WHAT STAYED WITHIN RANGE
          </div>
          <ul className="mt-3 space-y-2 text-white/75">
            <li>No immediate attention signals were triggered.</li>
            <li>No softening conditions crossed threshold.</li>
            <li>No early warning conditions moved into Watch.</li>
          </ul>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs font-mono text-white/45">
            ONE THING TO WATCH
          </div>
          <p className="mt-2 text-white/85">
            Mid-week performance has shown slight variability. If it continues,
            DRIFT will surface it early.
          </p>
        </div>

        <p className="mt-5">
          DRIFT will continue monitoring and surface any meaningful change the
          moment it matters.
        </p>

        <div className="mt-5 text-xs text-white/45">
          Open DRIFT → Command Center
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      {/* HERO */}
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-20 text-center">
  <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-tight tracking-tight md:text-[3.2rem]">
    Your revenue should never surprise you.
  </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">
          DRIFT catches meaningful revenue movement while it is still small
          enough to act on.
        </p>

        <p className="mx-auto mt-4 max-w-2xl text-sm text-white/65">
          No dashboards to interpret. No noise to sort through. Just clear
          signals when something actually changes.
        </p>

        {/* SIGNAL PREVIEW */}
        <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-white/10 bg-white/5 p-5 text-left">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs text-white/45">DRIFT SIGNAL</div>

            <div className="rounded-full bg-orange-500/10 px-3 py-1 text-xs text-orange-300">
              Softening
            </div>
          </div>

          <div className="mt-3 text-sm text-white/85">
            Revenue is down 14% vs baseline.
          </div>

          <div className="mt-1 text-xs text-white/60">
            Below expected range for 4 consecutive days.
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 flex justify-center">
          <a
            href="#demo"
            className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F]"
          >
            See how DRIFT detects revenue shifts
          </a>
        </div>

        <p className="mx-auto mt-3 max-w-2xl text-xs text-white/45">
          Built for operators who need signal, not noise.
        </p>
      </section>

      {/* DEMO */}
      <section id="demo" className="mx-auto max-w-4xl px-6 pb-16 pt-12">
        <div className="mb-5 flex flex-col items-start gap-2 text-sm text-white/60">
  <div className="flex items-center gap-2">
    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>

    <div>
      <div className="text-white/85 font-medium">
        60-Second Operator Demo
      </div>
      <div className="text-xs text-white/50">
        Watch how DRIFT detects a shift before it becomes obvious.
      </div>
    </div>

    <span className="text-white/35 ml-2">·</span>
    <JobTicker />
  </div>
</div>

        <DemoCard />

        <div className="mt-4 text-center text-xs text-white/50">
  Notice how the signal changes before the numbers fully move.
</div>

<div className="mt-1 text-center text-xs text-white/40">
  Let it run for a few seconds.
</div>

        {/* MONDAY EMAIL */}
        <MondayBriefingSample />
      </section>

      <HowOperatorsUseDrift />

      <section className="mx-auto mt-14 max-w-5xl px-6">
        <OperatorFitSection />
        <div className="pb-24">
          <LandingAccountActions />
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} DRIFT</div>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
