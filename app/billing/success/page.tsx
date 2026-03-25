import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    business_id?: string;
    session_id?: string;
  }>;
}) {
  const params = await searchParams;
  const businessId = params.business_id ?? "";
  const supabase = supabaseAdmin();

  let business: {
    id: string;
    name: string;
    billing_status: string | null;
    billing_plan: string | null;
  } | null = null;

  if (businessId) {
    const { data } = await supabase
      .from("businesses")
      .select("id,name,billing_status,billing_plan")
      .eq("id", businessId)
      .single();

    business = data;
  }

  const planLabel =
    business?.billing_plan === "founder_299"
      ? "Founding Cohort"
      : business?.billing_plan === "founder_399"
      ? "Founder Lifetime"
      : "Standard";

  return (
    <main className="min-h-screen bg-[#070B18] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-40 left-10 h-[260px] w-[260px] rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 py-14">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← Back Home
          </Link>

          <div className="text-xs text-white/55">
            DRIFT <span className="text-white/30">/ Billing Confirmed</span>
          </div>
        </div>

        <div className="mt-20 rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
            Billing Active
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
            You’re fully active on DRIFT.
          </h1>

          <p className="mt-4 leading-relaxed text-white/70">
            Billing is confirmed and monitoring remains active. DRIFT will
            continue watching revenue quietly in the background and surface
            movement when it materially matters.
          </p>
          <div className="mt-4 text-sm text-white/65">
  Your next DRIFT signal will arrive as soon as movement is detected.
</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-xs font-mono tracking-wide text-white/45">
                BILLING STATUS
              </div>
              <div className="mt-2 text-sm font-semibold text-white/85">
                {business?.billing_status === "active"
                  ? "Active"
                  : "Finalizing"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-xs font-mono tracking-wide text-white/45">
                PLAN
              </div>
              <div className="mt-2 text-sm font-semibold text-white/85">
                {planLabel}
              </div>
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
  DRIFT is continuously evaluating your revenue patterns in the background.
</div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
            >
              Return to DRIFT
            </Link>

            <Link
              href={`/upgrade?business_id=${businessId}`}
              className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Review Billing
            </Link>
          </div>

          <div className="mt-6 text-[11px] leading-relaxed text-white/45">
            DRIFT will continue delivering signal alerts as revenue movement becomes actionable.
          </div>
        </div>

        <div className="mt-14 text-center text-xs text-white/35">
          © {new Date().getFullYear()} DRIFT
        </div>
      </div>
    </main>
  );
}