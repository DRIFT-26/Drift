export default function HowOperatorsUseDrift() {
  return (
    <section className="mx-auto mt-20 max-w-5xl px-6">
      <div className="mb-8 text-center">
        <div className="text-xs font-mono tracking-wide text-white/45">
          OPERATOR WORKFLOW
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          How operators use DRIFT
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/65">
          From signal to action in minutes — not after the month closes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xs font-mono tracking-wide text-white/45">
            STEP 01:
          </div>
          <h3 className="mt-3 text-base font-semibold text-white">
            Signal Arrives
          </h3>
          <p className="mt-2 text-sm text-white/70">
            DRIFT alerts you when revenue deviates materially from expected behavior.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xs font-mono tracking-wide text-white/45">
            STEP 02:
          </div>
          <h3 className="mt-3 text-base font-semibold text-white">
            Evidence Appears
          </h3>
          <p className="mt-2 text-sm text-white/70">
            Each signal includes why it showed up and the direction of the change.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xs font-mono tracking-wide text-white/45">
            STEP 03:
          </div>
          <h3 className="mt-3 text-base font-semibold text-white">
            Action Gets Faster
          </h3>
          <p className="mt-2 text-sm text-white/70">
            Operators confirm the driver, tighten the loop, and intervene before the deviation compounds.
          </p>
        </div>
      </div>
    </section>
  );
}