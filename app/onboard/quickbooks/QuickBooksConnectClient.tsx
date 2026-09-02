"use client";

import Link from "next/link";
import { useState } from "react";

export default function QuickBooksConnectClient({
  businessId,
  company,
  email,
  timezone,
  error,
}: {
  businessId: string;
  company: string;
  email: string;
  timezone: string;
  error: string;
}) {
  const [connecting, setConnecting] = useState(false);

  function connectQuickBooks() {
    if (!businessId || connecting) return;
    setConnecting(true);
    window.location.href = `/api/quickbooks/connect?business_id=${encodeURIComponent(
      businessId
    )}`;
  }

  const backHref = `/onboard?company=${encodeURIComponent(
    company
  )}&email=${encodeURIComponent(email)}&timezone=${encodeURIComponent(timezone)}`;

  return (
    <main className="min-h-screen bg-[#070B18] text-white">
      <style>{`
  @keyframes driftPulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 rgba(56, 189, 248, 0);
      opacity: 0.9;
    }
    50% {
      transform: scale(1.015);
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.18);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 rgba(56, 189, 248, 0);
      opacity: 0.9;
    }
  }
`}</style>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-40 left-10 h-[260px] w-[260px] rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 py-14">
        <div className="flex items-center justify-between">
          <Link href={backHref} className="text-sm text-white/70 hover:text-white">
            Back
          </Link>

          <div className="text-xs text-white/55">
            DRIFT <span className="text-white/30">/ QuickBooks Setup</span>
          </div>
        </div>

        <div className="mt-20 rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
            QuickBooks Online
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
            Connect QuickBooks to DRIFT.
          </h1>

          <p className="mt-4 text-sm leading-7 text-white/70">
            DRIFT will read revenue reporting data from QuickBooks Online, then
            prepare your first revenue signal. DRIFT does not create invoices,
            change accounting records, process payments, or move money.
          </p>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              QuickBooks could not be connected. Please try again, or contact
              support if this keeps happening.
            </div>
          ) : null}

          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs font-semibold tracking-wide text-white/55">
              WHAT HAPPENS NEXT
            </div>

            <div className="mt-3 space-y-2 text-sm text-white/72">
              <div>Sign in to Intuit and choose your QuickBooks company.</div>
              <div>Approve read access for QuickBooks accounting reports.</div>
              <div>DRIFT imports recent revenue and prepares your first signal.</div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-6 text-white/55">
            By connecting QuickBooks, you authorize DRIFT to access the
            QuickBooks data needed to provide revenue monitoring and alerts. You
            can disconnect access later from QuickBooks or by contacting support.
          </div>

          <button
            type="button"
            disabled={!businessId || connecting}
            onClick={connectQuickBooks}
            className="mt-8 w-full rounded-md bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
            style={
              connecting
                ? {
                    animation: "driftPulse 1.8s ease-in-out infinite",
                  }
                : undefined
            }
          >
            {connecting ? "Opening QuickBooks..." : "Connect QuickBooks"}
          </button>

          {!businessId ? (
            <div className="mt-3 text-xs text-white/45">
              Missing business context. Return to onboarding and start again.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
