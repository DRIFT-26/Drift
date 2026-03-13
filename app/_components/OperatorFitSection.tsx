export default function OperatorFitSection() {
  return (
    <section className="mx-auto mt-8 max-w-5xl px-6">

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
    </section>
  );
}