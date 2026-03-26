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
  } | null = null;

  if (businessId) {
    const { data } = await supabase
      .from("businesses")
      .select("id,name,founding_cohort,billing_status,alert_email")
      .eq("id", businessId)
      .single();

    business = data;
  }

  return (
    <main className="min-h-screen bg-[#0B1220] px-6 py-20 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-xs font-mono tracking-wide text-white/45">
            DRIFT UPGRADE
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Keep DRIFT active before visibility disappears.
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/65">
            DRIFT is already identifying changes in your revenue behavior.
            Upgrade now to keep continuous monitoring and alert coverage active
            when something materially shifts.
          </p>

          <div className="mt-6 text-center text-xs text-white/40">
            Monitoring continues only with an active plan.
          </div>
        </div>

        {canceled && (
          <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            Your upgrade wasn’t completed. You can resume monitoring below at
            any time.
          </div>
        )}

        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
          <div className="text-sm font-semibold text-red-300">
            What happens if monitoring stops:
          </div>

          <div className="mt-3 space-y-2 text-sm text-white/80">
            <div>• Revenue declines can go undetected until they become obvious</div>
            <div>• Early momentum changes can be missed completely</div>
            <div>• Alerts stop, visibility drops, and intervention gets delayed</div>
          </div>

          <div className="mt-4 text-sm text-white/60">
            DRIFT does not give you another dashboard to babysit. It tells you
            when something is changing.
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-2xl text-center">
          <div className="text-sm text-white/70">
            You do not need more reporting.
          </div>
          <div className="mt-2 text-sm font-semibold text-white">
            You need to know when revenue behavior changes before it costs you.
          </div>
        </div>

        {business ? (
          (() => {
            const allowlistRaw = (process.env.BETA_FOUNDER_EMAILS || "").trim();

            const allowlist = allowlistRaw
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean);

            const email = String(business.alert_email || "").toLowerCase();
            const isAllowlisted =
              Boolean(email) && allowlist.includes(email);

            const showFounder =
              Boolean(business.founding_cohort) || isAllowlisted;

            return (
              <UpgradeActions
                businessId={business.id}
                foundingCohort={showFounder}
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
      </div>
    </main>
  );
}