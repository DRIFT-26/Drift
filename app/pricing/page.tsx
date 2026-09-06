import Link from "next/link";

export const metadata = {
  title: "Pricing | DRIFT",
  description: "DRIFT founding cohort pricing",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-white/85">
            DRIFT
          </Link>
          <Link href="/demo" className="text-sm text-white/65 hover:text-white">
            View Demo
          </Link>
        </div>

        <div className="mx-auto mt-16 max-w-3xl text-center">
          <div className="text-xs font-mono uppercase tracking-wide text-white/45">
            Founding Cohort Pricing
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Start with 30 days free.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/70">
            DRIFT monitors revenue movement and sends clear alerts when
            performance meaningfully changes. No dashboard digging, no noisy
            reporting, and no card required to start.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)] md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">
                Founding Cohort
              </div>
              <div className="mt-2 text-sm text-white/60">
                Limited to the first 10 companies.
              </div>
            </div>

            <div className="text-left md:text-right">
              <div className="text-4xl font-semibold tracking-tight">$299</div>
              <div className="mt-1 text-sm text-white/55">
                per month for your first 12 months
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50/85">
            30 days free. Then $299/month if you choose to continue. No card
            required.
          </div>

          <div className="mt-6 grid gap-3 text-sm text-white/75">
            <div>Includes up to 3 locations</div>
            <div>Daily revenue monitoring</div>
            <div>Revenue drift alerts when meaningful changes appear</div>
            <div>Weekly operator briefing</div>
            <div>Stripe, Google Sheets, and CSV supported at launch</div>
            <div>QuickBooks support is in verification with Intuit</div>
          </div>

          <div className="mt-6 border-t border-white/10 pt-5 text-sm text-white/60">
            Additional locations are $99/month each after the included 3
            locations.
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/onboard"
              className="inline-flex flex-1 items-center justify-center rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#0B1220] transition hover:bg-white/90"
            >
              Start 30 Days Free
            </Link>
            <Link
              href="/demo"
              className="inline-flex flex-1 items-center justify-center rounded-md border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              View Sample Demo
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-2xl text-center text-xs leading-6 text-white/45">
          DRIFT is priced for operators who want early warning, not another
          reporting chore. Pricing may change after the founding cohort closes.
        </div>
      </section>
    </main>
  );
}
