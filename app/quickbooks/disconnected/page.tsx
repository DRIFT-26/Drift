import Link from "next/link";

export const metadata = {
  title: "QuickBooks Disconnected | DRIFT",
  description: "QuickBooks connection disconnected from DRIFT",
};

export default function QuickBooksDisconnectedPage() {
  return (
    <main className="min-h-screen bg-[#070B18] text-white">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <Link href="/" className="text-sm text-white/70 hover:text-white">
          Back to DRIFT
        </Link>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <div className="text-xs font-mono tracking-wide text-white/45">
            QUICKBOOKS
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            QuickBooks has been disconnected.
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/70">
            DRIFT will no longer use this QuickBooks connection for future
            revenue syncs. You can reconnect QuickBooks from onboarding when you
            are ready.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/onboard"
              className="inline-flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
            >
              Reconnect QuickBooks
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
