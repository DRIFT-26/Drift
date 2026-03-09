"use client";

import DemoCard from "@/app/_components/DemoCard";
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
      { t: nowStamp(), msg: "ingest: queued (14d)" },
      { t: nowStamp(), msg: "compute: scheduled" },
      { t: nowStamp(), msg: "alerts: standing by" },
    ],
    []
  );

  const [ticks, setTicks] = useState<Tick[]>(seed);

  useEffect(() => {
    const events = [
  "Revenue ingest complete",
  "Baseline model refreshed",
  "Revenue signal evaluated",
  "Material deviation scan complete",
  "Momentum check complete",
  "Signal dispatch window open",
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
        <div className="text-xs text-white/45 font-mono tracking-wide">
          THE CONTROL LAYER
        </div>

        <h2 className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">
          DRIFT sits between your revenue systems and your attention.
        </h2>

        <p className="mt-4 text-sm md:text-base text-white/80">
          It runs quietly in the background, surfaces only{" "}
          <span className="text-white/90 font-medium">material deviation</span>{" "}
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
          <div className="text-xs text-white/45 font-mono">
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
            DRIFT connects directly to Stripe or ingests revenue data from Sheets and exports from systems like Toast, QuickBooks, Shopify, and Square.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs text-white/45 font-mono">
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
            <div className="text-xs text-white/45 font-mono">SYSTEM ONLINE</div>
            <div className="mt-1 text-sm text-white/80">Signals Streaming</div>
            <div className="mt-3 text-xs text-white/50">
              DRIFT ignores noise and escalates only trajectory-changing
              movement.
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs text-white/45 font-mono">
            OPERATOR SIGNALS
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/85">DRIFT Signal</div>
                <div className="text-xs text-white/45 font-mono">
                  Confidence: High
                </div>
              </div>
              <div className="mt-2 text-sm text-white/80">Action Needed 🔴</div>
              <div className="mt-1 text-xs text-white/55">
                Material Deviation vs Baseline — Investigate cause.
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/85">DRIFT Signal</div>
                <div className="text-xs text-white/45 font-mono">
                  Confidence: Medium
                </div>
              </div>
              <div className="mt-2 text-sm text-white/80">Trending Down 🟠</div>
              <div className="mt-1 text-xs text-white/55">
                Early Softening — Confirm direction and controllability.
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/85">DRIFT Signal</div>
                <div className="text-xs text-white/45 font-mono">
                  Confidence: Medium
                </div>
              </div>
              <div className="mt-2 text-sm text-white/80">
                Movement Detected 🟡
              </div>
              <div className="mt-1 text-xs text-white/55">
                New Pattern Emerging — Capture evidence before it compounds.
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-white/45 font-mono">
            Evidence Only — The signal is the product.
          </p>
        </div>
      </div>
    </section>
  );
}

function MaterialDeviationSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 md:p-8">
        <div className="text-xs text-white/45 font-mono tracking-wide">
          MATERIAL DEVIATION
        </div>
        <h3 className="mt-3 text-xl md:text-2xl font-semibold tracking-tight">
          DRIFT ignores noise while surfacing only trajectory-changing movement.
        </h3>
        <p className="mt-3 max-w-3xl text-sm md:text-base text-white/70">
          Most dashboards show fluctuations that don’t matter. DRIFT filters routine variance and
          alerts only when the system deviates materially from expected behavior — early enough to act.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/45 font-mono">NOISE</div>
            <div className="mt-1 text-sm text-white/80">Normal Daily Variance</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/45 font-mono">MATERIAL</div>
            <div className="mt-1 text-sm text-white/80">Baseline Deviation</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/45 font-mono">ACTION</div>
            <div className="mt-1 text-sm text-white/80">Evidence-First Investigation</div>
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
      // drift a bit so it feels alive
      setMins((m) => {
        const delta = Math.random() < 0.55 ? 1 : 0; // usually increases slowly
        const next = Math.min(12, m + delta);
        return next;
      });
    }, 12000);

    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-xs text-white/55 font-mono">
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
      <section className="mx-auto max-w-5xl px-6 pt-28 pb-18 text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
  Your revenue should never surprise you.
</h1>

<p className="mt-4 text-sm md:text-base text-white/55 max-w-2xl mx-auto font-mono tracking-wide">
  DRIFT is the control layer for revenue operations.
</p>

<p className="mt-4 text-lg text-white/75 max-w-2xl mx-auto">
  It detects material deviation before it becomes visible in your dashboards or on your P&amp;L.
</p>

<p className="mt-4 text-sm text-white/65 max-w-2xl mx-auto">
  DRIFT continuously monitors your revenue infrastructure and alerts you the moment momentum shifts.
</p>

<div className="mt-8 mx-auto max-w-xl rounded-lg border border-white/10 bg-white/5 p-4 text-left">
  <div className="flex items-center justify-between">
    <div className="text-xs font-mono text-white/45">DRIFT SIGNAL</div>

    <div className="rounded-full bg-orange-500/10 px-3 py-1 text-xs text-orange-300">
      Trending Down
    </div>
  </div>

  <div className="mt-3 text-sm text-white/85">
    Revenue is down 14% vs Baseline.
  </div>

  <div className="mt-1 text-xs text-white/60">
    Below baseline for 4 consecutive days.
  </div>
</div>

        

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
        <p className="mt-3 text-xs text-white/45 max-w-2xl mx-auto">
          Built for operators who run the business by the numbers. Signals currently generated from Stripe + operational data.
        </p>
      </section>

      {/* Control Layer Section (NEW) */}
      <ControlLayerSection />

      {/* Demo Section */}
      <section id="demo" className="mx-auto max-w-4xl px-6 pb-12">
        {/* Live System Preview */}
        <div className="text-sm text-white/65 mb-4 flex flex-wrap items-center gap-2">
  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
  <span>Live Operator Signal Preview</span>

  {/* System activity */}
  <span className="text-white/35">·</span>
  <JobTicker />

  {/* Operator metadata */}
  <span className="text-white/35">·</span>
  <OpsMeta />
</div>

<section id="demo" className="mx-auto max-w-4xl px-6 pb-12">

        <DemoCard />

        </section>
        
        {/* Material Deviation Section (NEW) */}
      <div className="mt-4">
        <MaterialDeviationSection />
      </div>  

      {/* Footer spacer */}
      <div className="pb-16" />

        {/* Request Access CTA */}
        <div className="mt-2 flex flex-col items-center">
          <a
            href="/onboard"
            className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-6 py-3 text-sm font-semibold text-white hover:bg-[#09306F] transition shadow-[0_10px_30px_rgba(10,42,102,0.35)]"
          >
            Join the Founding Cohort
          </a>

          <p className="mt-2 text-xs text-white/50">
            Takes ~30 seconds · No commitment required
          </p>
        </div>

        <div className="mt-3 text-center text-xs text-white/55">
          Founding Cohort · Limited to 10 companies
        </div>

        <div className="mt-3 text-center text-xs text-white/45">
Forwarded by an operator using DRIFT
</div>
      </section>

      
    </main>
  );
}