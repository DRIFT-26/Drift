import { supabaseAdmin } from "@/lib/supabase/server";
import UpgradeActions from "./UpgradeActions";

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{
    business_id?: string;
    canceled?: string;
  }>;
}) {
  const params = await searchParams;
  const canceled = params.canceled === "true";
  const businessId = params.business_id ?? "";
  const supabase = supabaseAdmin();

  let business: {
    id: string;
    name: string;
    founding_cohort: boolean | null;
    billing_status: string | null;
    alert_email: string | null;
    owner_id?: string | null;
  } | null = null;

  if (businessId) {
    const { data } = await supabase
      .from("businesses")
      .select("id,name,founding_cohort,billing_status,alert_email,owner_id")
      .eq("id", businessId)
      .single();

    business = data;
  }

  let totalLocations = 0;
  const includedLocations = 3;
  let additionalLocations = 0;

  if (business) {
    if (business.owner_id) {
      const { count } = await supabase
        .from("businesses")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", business.owner_id);

      totalLocations = count ?? 0;
    } else if (business.alert_email) {
      const { count } = await supabase
        .from("businesses")
        .select("*", { count: "exact", head: true })
        .eq("alert_email", business.alert_email);

      totalLocations = count ?? 0;
    }

    additionalLocations = Math.max(totalLocations - includedLocations, 0);
  }

  return (
    <main className="min-h-screen bg-[#0B1220] px-6 py-20 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-xs font-mono tracking-wide text-white/45">
            DRIFT UPGRADE
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            You’ve already seen what DRIFT catches. Keep it running.
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/65">
            DRIFT is actively monitoring your revenue behavior and detecting
            changes before they become visible. Keep continuous monitoring and
            alerts active so nothing slips past you.
          </p>

          <div className="mt-6 text-center text-xs text-white/40">
            Monitoring continues only with an active plan.
          </div>
        </div>

        {canceled && (
          <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            Your upgrade wasn’t completed. You can resume activation below at any time.
          </div>
        )}

        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white">
            Portfolio pricing overview
          </div>

          <div className="mt-3 space-y-2 text-sm text-white/80">
            <div>
              <strong className="text-white">$499/month</strong> introductory portfolio pricing
            </div>

            <div>
              <strong className="text-white">$299/month</strong> for 12 months or{" "}
              <strong className="text-white">$399/month</strong> lifetime Founding Cohort pricing
            </div>

            <div>
              Includes up to{" "}
              <strong className="text-white">{includedLocations}</strong> locations per portfolio
            </div>

            <div className="text-white/70">
              Additional locations:{" "}
              <strong className="text-white">$99/month each</strong>
            </div>

            <div className="text-white/60">
              Introductory pricing is available during the current launch period and may be updated with notice as DRIFT expands.
            </div>

            {business ? (
              <div>
                Portfolio currently monitoring{" "}
                <strong className="text-white">{totalLocations}</strong>{" "}
                location{totalLocations === 1 ? "" : "s"}
              </div>
            ) : null}
            {business && additionalLocations > 0 ? (
              <div className="text-[#FFC266]">
                <strong className="text-white">+{additionalLocations}</strong>{" "}
                additional billable location
                {additionalLocations === 1 ? "" : "s"} beyond the included threshold
              </div>
            ) : business ? (
              <div>Your current portfolio is within the included location threshold.</div>
            ) : null}
          </div>

          <div className="mt-4 text-sm text-white/60">
            DRIFT is priced at the portfolio level — not per seat, dashboard, or report.
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
          <div className="text-sm font-semibold text-red-300">
            What happens when monitoring stops:
          </div>

          <div className="mt-3 space-y-2 text-sm text-white/80">
            <div>• Revenue shifts go unnoticed until they become obvious</div>
            <div>• Early momentum signals disappear</div>
            <div>• Intervention happens later — when it’s more expensive</div>
          </div>

          <div className="mt-4 text-sm text-white/60">
            DRIFT exists to catch what you don’t have time to watch.
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-2xl text-center">
          <div className="text-sm text-white/70">
            You do not need another dashboard.
          </div>
          <div className="mt-2 text-sm font-semibold text-white">
            You need to know when something changes — before it costs you.
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xs font-mono tracking-wide text-white/45">
            WHY DRIFT EXISTS
          </div>

          <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
            Catch revenue problems before they become losses.
          </h2>

          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Most operators do not have a data problem — they have a timing problem.
            By the time something shows up clearly in revenue, it has often already
            been happening for days or weeks.
          </p>

          <p className="mt-4 text-sm leading-relaxed text-white/70">
            DRIFT monitors behavioral shifts across your business and surfaces what
            needs attention before performance drops become obvious in the numbers.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
              Identify issues{" "}
              <span className="font-semibold text-white">
                before revenue declines
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
              Know{" "}
              <span className="font-semibold text-white">
                where to look and why
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
              Prioritize action across locations{" "}
              <span className="font-semibold text-white">
                without digging through reports
              </span>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-xs font-mono tracking-wide text-white/45">
            WHAT THIS REPLACES
          </div>

          <p className="mt-4 text-sm leading-relaxed text-white/70">
            DRIFT replaces hours spent digging through reports, second-guessing
            performance, and reacting too late.
          </p>

          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Instead of asking{" "}
            <span className="font-semibold text-white">“what happened?”</span>,
            you know where to look before it does.
          </p>

          <div className="mt-5 space-y-2 text-sm text-white/75">
            <div>• Less time analyzing data manually</div>
            <div>• Faster response to performance shifts</div>
            <div>• Fewer missed signals across locations</div>
          </div>
        </div>

        {business ? (
          (() => {
            const allowlistRaw = (process.env.BETA_FOUNDERS || "").trim();

            const allowlist = allowlistRaw
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean);

            const email = String(business.alert_email || "").trim().toLowerCase();
            const isAllowlisted =
              Boolean(email) && allowlist.includes(email);

            const showFounder =
              Boolean(business.founding_cohort) || isAllowlisted;

            return (
              <UpgradeActions
                businessId={business.id}
                foundingCohort={showFounder}
                totalLocations={totalLocations}
                includedLocations={includedLocations}
                additionalLocations={additionalLocations}
              />
            );
          })()
        ) : (
          <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6 text-center ring-1 ring-white/10">
            <div className="text-sm text-white/70">
              Missing business context. Return to onboarding and try again.
            </div>
          </div>
        )}

        <div className="mx-auto mt-10 max-w-3xl text-center">
          <p className="text-sm leading-relaxed text-white/60">
            Most teams do not realize something is wrong until it has already
            affected revenue. DRIFT exists to change that.
          </p>
        </div>
      </div>
    </main>
  );
}