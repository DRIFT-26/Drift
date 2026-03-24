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
  } | null = null;

  if (businessId) {
    const { data } = await supabase
      .from("businesses")
      .select("id,name,founding_cohort,billing_status")
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
            Continue monitoring with DRIFT.
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm text-white/65">
            Upgrade to keep revenue signal monitoring, alert delivery, and operator previews active.
          </p>
        </div>

        {canceled && (
  <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
  Your upgrade wasn’t completed. Monitoring will pause when your trial ends.
</div>
)}

{business ? (
          <UpgradeActions
            businessId={business.id}
            foundingCohort={Boolean(business.founding_cohort)}
          />
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