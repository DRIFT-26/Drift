import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "DRIFT helps operators catch meaningful revenue movement before it compounds.",
  openGraph: {
    title: "About DRIFT",
    description:
      "DRIFT is built for operators who need early warning across every revenue stream.",
    url: "https://drifthq.co/about",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "DRIFT signal preview showing revenue movement and Operator Score.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About DRIFT",
    description:
      "DRIFT is built for operators who need early warning across every revenue stream.",
    images: ["/og-image.svg"],
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-white/85">
            DRIFT
          </Link>
          <div className="flex items-center gap-5 text-sm text-white/65">
            <Link href="/pricing" className="hover:text-white">
              Pricing
            </Link>
            <Link href="/onboard" className="font-semibold text-white">
              Start Free
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-4xl">
          <div className="text-xs font-mono uppercase text-white/45">
            About DRIFT
          </div>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Revenue should be caught while it is still small enough to fix.
          </h1>
          <div className="mt-6 space-y-5 text-sm leading-7 text-white/72">
            <p>
              Operators are already surrounded by reports. The harder problem
              is knowing which movement matters, when it started, and whether
              it needs action before it compounds.
            </p>
            <p>
              DRIFT was built around that operating reality. It watches revenue
              behavior across streams and locations, compares current movement
              against a rolling baseline, and surfaces the signal in plain
              language.
            </p>
            <p>
              The goal is simple: make revenue shifts easier to see, easier to
              explain, and easier to act on without turning the business into
              another analytics project.
            </p>
          </div>

          <div className="mt-8 grid gap-3 text-sm text-white/72 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              Multi-location monitoring
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              Weekly operator briefings
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              Revenue anomaly signals
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.045] p-6">
            <div className="text-sm font-semibold text-white">
              Questions about DRIFT?
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Send questions about setup, data sources, pricing, or the founding
              cohort to the DRIFT team.
            </p>
            <a
              href="mailto:hello@drifthq.co"
              className="mt-5 inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#0B1220] transition hover:bg-white/90"
            >
              Contact DRIFT
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
