// app/page.tsx
import Link from "next/link";
import DemoCard from "@/app/_components/DemoCard";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        {/* Top nav */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-black tracking-wide text-white/90">DRIFT</div>
          <div className="flex items-center gap-3">
            <Link
              href="/demo"
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold ring-1 ring-white/10 hover:bg-white/15"
            >
              View demo
            </Link>
          </div>
        </div>

        {/* Hero */}
        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
              Quiet revenue control — always on
            </div>

            <h1 className="mt-5 text-4xl font-extrabold tracking-tight md:text-5xl">
              Know The Moment Revenue Shifts
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
  DRIFT is a revenue control layer that detects material deviation before it becomes visible in dashboards.
</p>

<p className="mt-3 max-w-xl text-sm text-white/55">
  One signal. One reason. One decision.
</p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/onboard"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#0B1220] hover:bg-white/90"
              >
                Join the Founding Cohort
              </Link>

              {/* ✅ IMPORTANT: do NOT link to /alerts here (can be protected / 401). */}
              <Link
                href="/demo"
                className="inline-flex items-center justify-center rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold ring-1 ring-white/10 hover:bg-white/15"
              >
                See what DRIFT looks like
              </Link>
            </div>

            <div className="mt-2 text-xs font-semibold text-white/60">
              Limited Founding Cohort — 10 companies
            </div>

            <div className="mt-8 grid gap-3 text-sm text-white/75">
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="font-extrabold text-white/90">Control, not analytics.</div>
                <div className="mt-1">
                  One sentence. One signal. One decision. DRIFT shows you what changed and why it
                  matters.
                </div>
              </div>
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="font-extrabold text-white/90">Automatic by default.</div>
                <div className="mt-1">
                  DRIFT runs quietly in the background and delivers alerts when deviation becomes
                  material.
                </div>
              </div>
            </div>
          </div>

          {/* Demo preview */}
          <div>
            <div className="mb-3 text-xs font-semibold tracking-wide text-white/60">
              DRIFT watches the signals most dashboards miss.
            </div>
            <DemoCard />
            <div className="mt-3 text-xs text-white/55">
              Auto-updates are simulated here to demonstrate the feel — onboarding is automatic.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}