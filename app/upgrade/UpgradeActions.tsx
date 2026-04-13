"use client";

import { useState } from "react";

type UpgradeActionsProps = {
  businessId: string;
  foundingCohort: boolean;
  totalLocations: number;
  includedLocations: number;
  additionalLocations: number;
};

export default function UpgradeActions({
  businessId,
  foundingCohort,
  totalLocations,
  includedLocations,
  additionalLocations,
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
            These pricing options are reserved for selected Founding Operators
            and will not remain available after the cohort closes.
          </p>
        </div>
      )}

      <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-5 text-center ring-1 ring-white/10">
        <div className="text-xs font-mono tracking-wide text-white/45">
          PORTFOLIO STATUS
        </div>

        <div className="mt-3 text-sm text-white/75">
          Your portfolio is currently monitoring{" "}
          <span className="font-semibold text-white">{totalLocations}</span>{" "}
          location{totalLocations === 1 ? "" : "s"}.
        </div>

        <div className="mt-2 text-sm text-white/65">
          All plans include up to{" "}
          <span className="font-semibold text-white">{includedLocations}</span>{" "}
          location{includedLocations === 1 ? "" : "s"}.
          {additionalLocations > 0 ? (
            <>
              {" "}
              <span className="text-[#FFC266]">
                +{additionalLocations} additional billable location
                {additionalLocations === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <> Your current portfolio is within the included threshold.</>
          )}
        </div>
      </div>

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
            Portfolio Pricing · Cancel Anytime
          </div>

          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Continuous monitoring across your business with real-time signal
            detection and actionable alerts when performance begins to shift.
          </p>

          <div className="mt-4 space-y-2 text-xs text-white/55">
            <div>• Daily signal monitoring across your portfolio</div>
            <div>• Priority-based alerting when something needs attention</div>
            <div>• Executive signal visibility across locations</div>
            <div>• Includes up to {includedLocations} locations</div>
            {additionalLocations > 0 ? (
              <div className="text-[#FFC266]">
                • +{additionalLocations} additional billable location
                {additionalLocations === 1 ? "" : "s"}
              </div>
            ) : (
              <div>• Current portfolio is within included location threshold</div>
            )}
          </div>

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
            Full monitoring coverage. No interruptions.
          </div>
        </div>

        {foundingCohort && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-xs font-mono tracking-wide text-white/45">
              FOUNDING ACCESS
            </div>

            <div className="mt-4 text-2xl font-black">$299</div>
            <div className="mt-1 text-sm text-white/60">
              Per Month · First 12 Months
            </div>

            <div className="mt-4 text-xs text-white/50">
              Portfolio Pricing · Cancel Anytime
            </div>

            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Early operator pricing for teams joining DRIFT during the Founding
              Cohort window. Full monitoring, full signal coverage, preferred entry.
            </p>

            <div className="mt-4 space-y-2 text-xs text-white/55">
              <div>• Full DRIFT monitoring access</div>
              <div>• Same signal engine as standard monitoring</div>
              <div>• Founding pricing protection for 12 months</div>
              <div>• Includes up to {includedLocations} locations</div>
              {additionalLocations > 0 ? (
                <div className="text-[#FFC266]">
                  • +{additionalLocations} additional billable location
                  {additionalLocations === 1 ? "" : "s"}
                </div>
              ) : (
                <div>• Current portfolio is within included location threshold</div>
              )}
            </div>

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
              Limited to Founding Cohort participants.
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
              Per Month · Locked Founder Pricing
            </div>

            <div className="mt-4 text-xs text-white/50">
              Portfolio pricing · Cancel Anytime
            </div>

            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Lock in Founder pricing permanently and operate with DRIFT as a
              long-term control system as the platform continues to evolve.
            </p>

            <div className="mt-4 space-y-2 text-xs text-white/55">
              <div>• Permanent founder pricing protection</div>
              <div>• Full monitoring and signal coverage</div>
              <div>• Built for long-term operators</div>
              <div>• Includes up to {includedLocations} locations</div>
              {additionalLocations > 0 ? (
                <div className="text-[#FFC266]">
                  • +{additionalLocations} additional billable location
                  {additionalLocations === 1 ? "" : "s"}
                </div>
              ) : (
                <div>• Current portfolio is within included location threshold</div>
              )}
            </div>

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
              Permanent Founder Pricing · Limited Availability.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}