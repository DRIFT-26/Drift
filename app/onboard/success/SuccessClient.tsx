"use client";

import Link from "next/link";

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
            You’re all set.
          </h1>

          <p className="mt-4 leading-relaxed text-white/70">
            Your onboarding details have been received. DRIFT is now preparing your
            account and next steps.
          </p>

          {signal === "processing" && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              Your first DRIFT signal is being generated and will arrive in your
              corresponding email inbox shortly.
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

          <div className="mt-8 space-y-3 text-sm text-white/70">
            <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>Your system connection or upload has been received.</span>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>DRIFT will begin computing signal-level output from your revenue data.</span>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>You’ll receive alerts when revenue deviates materially.</span>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
            >
              Return home
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