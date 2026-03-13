export default function OperatorFitSection() {
  return (
    <section className="mx-auto mt-8 max-w-5xl px-6">
      <div className="mb-6">
        <div className="text-xs font-mono tracking-wide text-white/45">
          OPERATOR FIT
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Built for operators, not analysts.
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          <h3 className="text-sm font-mono tracking-wide text-white/45">
            WHO DRIFT IS FOR
          </h3>

          <p className="mt-3 text-sm text-white/70">
            Operators responsible for revenue performance.
          </p>

          <ul className="mt-4 space-y-3 text-sm text-white/80">
            <li>Multi-location operators who need early visibility</li>
            <li>Owner-operators catching revenue drift early</li>
            <li>Revenue leaders who prefer signals over dashboards</li>
            <li>Businesses where daily revenue movement matters</li>
          </ul>
        </div>

        <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          <h3 className="text-sm font-mono tracking-wide text-white/45">
            WHO DRIFT IS NOT FOR
          </h3>

          <p className="mt-3 text-sm text-white/70">
            DRIFT is not designed for reporting or analytics teams.
          </p>

          <ul className="mt-4 space-y-3 text-sm text-white/80">
            <li>Businesses looking for BI dashboards</li>
            <li>Teams reviewing revenue monthly</li>
            <li>Companies running complex forecasting systems</li>
            <li>Organizations that don’t act quickly on operational signals</li>
          </ul>
        </div>
      </div>

      <div className="mt-10 text-center">
        <a
          href="/onboard"
          className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F]"
        >
          Join the Founding Cohort
        </a>

        <div className="mt-3 text-sm text-white/60">Takes ~30 seconds</div>
        <div className="mt-1 text-xs text-white/45">
          Founding Cohort — Limited to 10 companies
        </div>
      </div>
    </section>
  );
}