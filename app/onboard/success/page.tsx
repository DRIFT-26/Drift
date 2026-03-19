import { Suspense } from "react";
import { redirect } from "next/navigation";
import SuccessClient from "./SuccessClient";
import { supabaseAdmin } from "@/lib/supabase/server";
import TrialCountdownBanner from "@/app/_components/TrialCountdownBanner";
import { businessHasAccess } from "@/lib/billing/access";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    signal?: string;
    source?: string;
    business_id?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();

  let business: {
    billing_status: string | null;
    trial_ends_at: string | null;
  } | null = null;

  if (params.business_id) {
    const { data } = await supabase
      .from("businesses")
      .select("billing_status, trial_ends_at")
      .eq("id", params.business_id)
      .single();

    business = data;
  }

  if (business && params.business_id && !businessHasAccess(business)) {
    redirect(`/upgrade?business_id=${encodeURIComponent(params.business_id)}`);
  }

  return (
    <Suspense fallback={null}>
      <div className="mx-auto max-w-5xl px-6 pt-6">
        {business && params.business_id && (
          <TrialCountdownBanner
            businessId={params.business_id}
            billingStatus={business.billing_status}
            trialEndsAt={business.trial_ends_at}
          />
        )}
      </div>

      <SuccessClient
        signal={params.signal ?? ""}
        source={params.source ?? ""}
      />
    </Suspense>
  );
}