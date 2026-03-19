import Link from "next/link";

export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-[#0B1220] px-6 py-20 text-white">
      <div className="mx-auto max-w-3xl text-center">
        <div className="text-xs font-mono tracking-wide text-white/45">
          DRIFT UPGRADE
        </div>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Continue monitoring with DRIFT.
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-sm text-white/65">
          Your trial has ended or is nearing completion. Upgrade to keep
          revenue signal monitoring, alert delivery, and operator previews active.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-xs font-mono tracking-wide text-white/45">
              STANDARD
            </div>
            <div className="mt-2 text-2xl font-black">$499</div>
            <div className="mt-1 text-sm text-white/60">per month</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-xs font-mono tracking-wide text-white/45">
              FOUNDING COHORT
            </div>
            <div className="mt-2 text-2xl font-black">$299</div>
            <div className="mt-1 text-sm text-white/60">per month · First 12 months</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-xs font-mono tracking-wide text-white/45">
              FOUNDER LIFETIME
            </div>
            <div className="mt-2 text-2xl font-black">$399</div>
            <div className="mt-1 text-sm text-white/60">per month · Lifetime</div>
          </div>
        </div>

        <div className="mt-8">
          <Link
            href="/onboard"
            className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F]"
          >
            Return to DRIFT
          </Link>
        </div>
      </div>
    </main>
  );
}