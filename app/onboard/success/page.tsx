import { Suspense } from "react";
import SuccessClient from "./SuccessClient";
import { supabaseAdmin } from "@/lib/supabase/server";
import TrialCountdownBanner from "@/app/_components/TrialCountdownBanner";
import { createOnboardAccessToken } from "@/lib/auth/onboard-access";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    signal?: string;
    source?: string;
    business_id?: string;
    touched_business_ids?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = supabaseAdmin();

  let business: {
    billing_status: string | null;
    trial_ends_at: string | null;
    alert_email: string | null;
  } | null = null;

  if (params.business_id) {
    const { data } = await supabase
      .from("businesses")
      .select("billing_status, trial_ends_at, alert_email")
      .eq("id", params.business_id)
      .single();

    business = data;
  }

  const touchedBusinessIds = params.touched_business_ids
    ? params.touched_business_ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : params.business_id
    ? [params.business_id]
    : [];

  let initialReady = false;

  if (touchedBusinessIds.length > 0) {
    const { data: readyBusinesses } = await supabase
      .from("businesses")
      .select("id,last_drift")
      .in("id", touchedBusinessIds);

    initialReady = (readyBusinesses ?? []).some((b) => !!b.last_drift);
  }

  const accessHref =
    business?.alert_email
      ? `/onboard/enter?token=${encodeURIComponent(
          createOnboardAccessToken(business.alert_email)
        )}`
      : "/login";

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
        businessId={params.business_id ?? ""}
        touchedBusinessIds={touchedBusinessIds}
        initialReady={initialReady}
        accessHref={accessHref}
      />
    </Suspense>
  );
}