// app/demo/page.tsx
import Link from "next/link";
import DemoCard from "@/app/_components/DemoCard";

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-black tracking-wide text-white/90">
            DRIFT
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/onboard"
              className="rounded-xl bg-white px-4 py-2 text-sm font-black text-[#0B1220] hover:bg-white/90"
            >
              Join the Founding Cohort
            </Link>
          </div>
        </div>

        <div className="mt-10">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Control Tower Preview
          </h1>
          <p className="mt-3 max-w-2xl text-white/70">
            This is the “Executive-Level” experience: one signal, the reason, and the decision prompt —
            without digging through dashboards.
          </p>

          <div className="mt-8">
            <DemoCard />
          </div>

          <div className="mt-6 flex gap-3">
            <Link
              href="/"
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold ring-1 ring-white/10 hover:bg-white/15"
            >
              ← Back
            </Link>
            <Link
              href="/onboard"
              className="rounded-xl bg-white px-4 py-2 text-sm font-black text-[#0B1220] hover:bg-white/90"
            >
              Start DRIFT
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}