"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function sourceLabel(source: string) {
  if (source === "stripe") return "Stripe";
  if (source === "google_sheets") return "Google Sheets";
  if (source === "csv") return "CSV Upload";
  return "Revenue Source";
}

export default function SuccessClient({
  signal,
  source,
}: {
  signal: string;
  source: string;
}) {
  const connectedSource = sourceLabel(source);
  const [showPreview, setShowPreview] = useState(signal === "processing");

  useEffect(() => {
    if (signal !== "processing") return;

    const timer = setTimeout(() => {
      setShowPreview(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [signal]);

  return (
    <main className="min-h-screen bg-[#070B18] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-40 left-10 h-[260px] w-[260px] rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 py-14">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← Back home
          </Link>

          <div className="text-xs text-white/55">
            DRIFT <span className="text-white/30">/ Onboarding Complete</span>
          </div>
        </div>

        <div className="mt-20 rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
            Founding Cohort
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
            You’re live on DRIFT.
          </h1>

          <p className="mt-4 leading-relaxed text-white/70">
            Monitoring is active. DRIFT is now watching your revenue quietly in the
            background and will surface movement when it materially matters.
          </p>

          {signal === "processing" && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              Your first DRIFT signal is being generated and will arrive in your
              inbox shortly.
            </div>
          )}

          {showPreview && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-mono tracking-wide text-white/45">
                    DRIFT SIGNAL
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white/85">
                    Evaluating Revenue Patterns…
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/65">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400/90" />
                  Live Compute
                </div>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full animate-previewLoad rounded-full bg-white/50" />
              </div>

              <div className="mt-2 text-[11px] text-white/45">
                DRIFT is establishing your first signal now.
              </div>
            </div>
          )}

          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs font-mono tracking-wide text-white/45">
              CONNECTED SOURCE
            </div>
            <div className="mt-2 text-sm font-semibold text-white/85">
              {connectedSource}
            </div>
          </div>

          <div className="mt-4 text-sm text-white/65">
            You’ll receive operator-grade alerts as soon as DRIFT detects
            trajectory-changing movement.
          </div>

          <div className="mt-8 space-y-3 text-sm text-white/70">
            <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>Your system connection or upload has been received.</span>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>DRIFT is establishing a baseline from your revenue data.</span>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>You’ll hear from DRIFT when something materially changes.</span>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/alerts"
              className="inline-flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
            >
              Open DRIFT
            </Link>

            <Link
              href="/onboard"
              className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Start Another Onboarding
            </Link>
          </div>

          <div className="mt-6 text-[11px] leading-relaxed text-white/45">
            DRIFT uses your connected data to compute drift signals and deliver
            operator-grade alerts.
          </div>
        </div>

        <div className="mt-14 text-center text-xs text-white/35">
          © {new Date().getFullYear()} DRIFT
        </div>
      </div>
    </main>
  );
}