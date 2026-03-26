"use client";

import { useState } from "react";

type UpgradeActionsProps = {
  businessId: string;
  foundingCohort: boolean;
};

export default function UpgradeActions({
  businessId,
  foundingCohort,
}: UpgradeActionsProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function startCheckout(
    plan: "standard" | "founder_299" | "founder_399"
  ) {
    try {
      setLoadingPlan(plan);

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business_id: businessId,
          plan,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok || !data?.url) {
        throw new Error(data?.error ?? "Failed to start checkout.");
      }

      window.location.href = data.url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      alert(message);
      setLoadingPlan(null);
    }
  }

  return (
    <div className="mt-10">
      {foundingCohort && (
        <div className="mx-auto mb-6 max-w-3xl text-center">
          <div className="text-xs font-mono tracking-wide text-white/45">
            FOUNDING COHORT ACCESS
          </div>
          <p className="mt-2 text-sm text-white/65">
            These pricing options are limited to selected founding operators and
            will not be offered again once the cohort closes.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 ring-2 ring-white/20">
          <div className="text-xs font-mono tracking-wide text-white/45">
            FULL MONITORING
          </div>
          <div className="mt-3 inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-black">
            Recommended
          </div>
          <div className="mt-4 text-2xl font-black">$499</div>
          <div className="mt-1 text-sm text-white/60">per month</div>
          <div className="mt-4 text-xs text-white/50">
            Cancel anytime · No long-term commitment
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/65">
            Continuous DRIFT monitoring with uninterrupted alert coverage when
            revenue movement becomes actionable.
          </p>
          <button
            type="button"
            onClick={() => startCheckout("standard")}
            disabled={loadingPlan !== null}
            className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-[#0A2A66] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F] disabled:opacity-70"
          >
            {loadingPlan === "standard"
              ? "Redirecting..."
              : "Keep DRIFT Active"}
          </button>
          <div className="mt-2 text-xs text-white/50">
            Full DRIFT monitoring. No interruptions.
          </div>
        </div>

        {foundingCohort && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-xs font-mono tracking-wide text-white/45">
              FOUNDING ACCESS
            </div>
            <div className="mt-4 text-2xl font-black">$299</div>
            <div className="mt-1 text-sm text-white/60">
              Per Month · First 12 months
            </div>
            <div className="mt-4 text-xs text-white/50">
              Cancel anytime · No long-term commitment
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Early operator pricing for teams entering DRIFT during the Founding
              Cohort window.
            </p>
            <button
              type="button"
              onClick={() => startCheckout("founder_299")}
              disabled={loadingPlan !== null}
              className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-[#0A2A66] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F] disabled:opacity-70"
            >
              {loadingPlan === "founder_299"
                ? "Redirecting..."
                : "Continue Monitoring at $299"}
            </button>
            <div className="mt-2 text-xs text-white/50">
              Early access pricing · Limited to Founding Cohort.
            </div>
          </div>
        )}

        {foundingCohort && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-xs font-mono tracking-wide text-white/45">
              FOUNDER LIFETIME
            </div>
            <div className="mt-4 text-2xl font-black">$399</div>
            <div className="mt-1 text-sm text-white/60">
              Per Month · Locked-in Founder pricing
            </div>
            <div className="mt-4 text-xs text-white/50">
              Cancel anytime · No long-term commitment
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/65">
              Lock in founder pricing permanently and keep DRIFT monitoring long
              term.
            </p>
            <button
              type="button"
              onClick={() => startCheckout("founder_399")}
              disabled={loadingPlan !== null}
              className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-[#0A2A66] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F] disabled:opacity-70"
            >
              {loadingPlan === "founder_399"
                ? "Redirecting..."
                : "Lock In $399 Founder Pricing"}
            </button>
            <div className="mt-2 text-xs text-white/50">
              Permanent Founder Pricing · Limited to Founding Cohort.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}