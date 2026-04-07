"use client";

import DemoCard from "@/app/_components/DemoCard";
import OperatorFitSection from "@/app/_components/OperatorFitSection";
import HowOperatorsUseDrift from "@/app/_components/HowOperatorsUseDrift";
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
    <span className="font-mono text-xs text-white/55">
      <span className="text-white/35">DRIFT</span>{" "}
      <span className="text-white/45">{latest.t}</span>{" "}
      <span className="text-white/35">·</span>{" "}
      <span className="text-white/70">{latest.msg}</span>{" "}
      <span className="text-white/35">·</span>{" "}
      <span className="text-white/70">Confidence: High</span>
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
      {children}
    </span>
  );
}

function ControlLayerSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <div className="mx-auto max-w-3xl text-center">
        <div className="font-mono text-xs tracking-wide text-white/45">
          THE CONTROL LAYER
        </div>

        <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
          <span className="whitespace-nowrap">DRIFT sits between</span>{" "}
          <span className="whitespace-nowrap">your revenue systems</span>{" "}
          <span className="whitespace-nowrap">and your attention.</span>
        </h2>

        <p className="mt-4 text-sm text-white/80 md:text-base">
          It runs quietly in the background, surfaces only{" "}
          <span className="font-medium text-white/90">material deviation</span>{" "}
          and gives you evidence fast enough to act.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Pill>Signal Layer</Pill>
          <Pill>Material Deviation</Pill>
          <Pill>Noise Filtered</Pill>
          <Pill>Evidence-First</Pill>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="font-mono text-xs text-white/45">
            SUPPORTED REVENUE SOURCES
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill>STRIPE</Pill>
            <Pill>GOOGLE SHEETS</Pill>
            <Pill>CSV</Pill>
            <Pill>TOAST</Pill>
            <Pill>QUICKBOOKS</Pill>
            <Pill>SHOPIFY</Pill>
            <Pill>SQUARE</Pill>
          </div>
          <p className="mt-4 text-sm text-white/55">
            DRIFT connects directly to Stripe or ingests revenue data from
            Sheets and exports from systems like Toast, QuickBooks, Shopify, and
            Square.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="font-mono text-xs text-white/45">
            DRIFT SIGNAL LAYER
          </div>

          <div className="mt-4 space-y-2 text-sm text-white/70">
            <div className="flex items-center justify-between">
              <span>Baseline Modeling --</span>
              <span className="font-mono text-white/45">Rolling Window</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Deviation Detection --</span>
              <span className="font-mono text-white/45">Material Only</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Evidence Capture --</span>
              <span className="font-mono text-white/45">Why + Where</span>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="font-mono text-xs text-white/45">SYSTEM ONLINE</div>
            <div className="mt-1 text-sm text-white/80">Signals Streaming</div>
            <div className="mt-3 text-xs text-white/50">
              DRIFT ignores noise and escalates only trajectory-changing
              movement.
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="font-mono text-xs text-white/45">
            OPERATOR SIGNALS
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                <div className="text-sm font-semibold text-white">Stable</div>
              </div>
              <div className="mt-2 text-sm text-white/70">
                Revenue tracking within expected baseline.
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
                <div className="text-sm font-semibold text-white">
                  Movement Detected
                </div>
              </div>
              <div className="mt-2 text-sm text-white/70">
                Early movement relative to baseline.
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-300" />
                <div className="text-sm font-semibold text-white">Softening</div>
              </div>
              <div className="mt-2 text-sm text-white/70">
                Revenue trending below baseline.
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <div className="text-sm font-semibold text-white">
                  Action Needed
                </div>
              </div>
              <div className="mt-2 text-sm text-white/70">
                Material deviation detected.
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                <div className="text-sm font-semibold text-white">
                  Momentum Detected
                </div>
              </div>
              <div className="mt-2 text-sm text-white/70">
                Revenue accelerating beyond baseline.
              </div>
            </div>
          </div>

          <p className="mt-4 font-mono text-xs text-white/45">
            Evidence Only — The signal is the product.
          </p>
        </div>
      </div>
    </section>
  );
}

function MaterialDeviationSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-10">
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 md:p-8">
        <div className="font-mono text-xs tracking-wide text-white/45">
          MATERIAL DEVIATION
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight md:text-2xl">
          DRIFT ignores noise while surfacing only trajectory-changing movement.
        </h3>
        <p className="mt-3 max-w-3xl text-sm text-white/70 md:text-base">
          Most dashboards show fluctuations that don’t matter. DRIFT filters
          routine variance and alerts only when the system deviates materially
          from expected behavior — early enough to act.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="font-mono text-xs text-white/45">NOISE</div>
            <div className="mt-1 text-sm text-white/80">
              Normal Daily Variance
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="font-mono text-xs text-white/45">MATERIAL</div>
            <div className="mt-1 text-sm text-white/80">
              Baseline Deviation
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="font-mono text-xs text-white/45">ACTION</div>
            <div className="mt-1 text-sm text-white/80">
              Evidence-First Investigation
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Pill>Baseline Window: 30–90d</Pill>
          <Pill>Detection: Statistical</Pill>
          <Pill>Confidence: Scoring</Pill>
        </div>
      </div>
    </section>
  );
}

function OpsMeta() {
  const [mins, setMins] = useState<number>(() => Math.floor(Math.random() * 6) + 1);

  useEffect(() => {
    const interval = setInterval(() => {
      setMins((m) => {
        const delta = Math.random() < 0.55 ? 1 : 0;
        const next = Math.min(12, m + delta);
        return next;
      });
    }, 12000);

    return () => clearInterval(interval);
  }, []);

  return (
    <span className="font-mono text-xs text-white/55">
      <span className="text-white/35">Baseline:</span>{" "}
      <span className="text-white/70">Rolling (90d)</span>{" "}
      <span className="text-white/35">·</span>{" "}
      <span className="text-white/35">Confidence:</span>{" "}
      <span className="text-white/70">High</span>{" "}
      <span className="text-white/35">·</span>{" "}
      <span className="text-white/35">Last Sync:</span>{" "}
      <span className="text-white/70">{mins}m ago</span>
    </span>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      {/* Hero Section */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Know what changed before you feel it.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">
          DRIFT surfaces meaningful revenue movement across your business before it
          turns into a bigger problem — or a missed opportunity.
        </p>

        <p className="mx-auto mt-4 max-w-2xl text-sm text-white/65">
          No dashboards to interpret. No noise to sort through. Just clear signals when
          revenue actually moves.
        </p>

        <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-white/10 bg-white/5 p-5 text-left shadow-[0_12px_40px_rgba(0,0,0,0.22)] backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs text-white/45">DRIFT SIGNAL</div>

            <div className="rounded-full bg-orange-500/10 px-3 py-1 text-xs text-orange-300">
              Softening
            </div>
          </div>

          <div className="mt-3 text-sm text-white/85">
            Revenue is down 14% vs Baseline.
          </div>

          <div className="mt-1 text-xs text-white/60">
            Below expected range for 4 consecutive days.
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 flex justify-center">
          <a
            href="#demo"
            className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(10,42,102,0.35)] transition hover:bg-[#09306F]"
          >
            See Live Signals
          </a>
        </div>

        {/* Founding Cohort Line */}
        <p className="mx-auto mt-3 max-w-2xl text-xs text-white/45">
          Built for operators who need to know what changed before the numbers tell the
          full story.
        </p>
      </section>

      <ControlLayerSection />

      {/* Demo Section */}
      <section id="demo" className="mx-auto max-w-4xl px-12 pt-12 pb-16">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-white/60">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
          <span className="text-white/78">Live Revenue Signal Preview</span>

          <span className="text-white/35">·</span>
          <JobTicker />

          <span className="text-white/35">·</span>
          <OpsMeta />
        </div>

        <DemoCard />

        <div className="mt-12">
          <MaterialDeviationSection />
        </div>
      </section>

      <HowOperatorsUseDrift />
        <section className="mx-auto mt-14 max-w-5xl px-6">


        <div className="mb-8 flex flex-col items-center text-center">
  <div className="text-xs font-mono tracking-wide text-white/45">
    OPERATOR FIT
  </div>

  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
    Built for operators who need signal, not noise.
  </h2>
</div>

        <OperatorFitSection />

        <div className="mt-10 pb-24 text-center">
          <a
            href="/onboard"
            className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F]"
          >
            Join the Founding Cohort
          </a>

          <div className="mt-3 text-sm text-white/60">Takes ~30 seconds</div>
          <div className="mt-1 text-xs text-white/45">
            Founding Cohort — Limited to 10 Companies
          </div>
        </div>
      </section>
    </main>
  );
}