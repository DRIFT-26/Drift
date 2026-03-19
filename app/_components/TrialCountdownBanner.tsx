import Link from "next/link";

type TrialCountdownBannerProps = {
  businessId: string;
  billingStatus: string | null;
  trialEndsAt?: string | null;
};

function getDaysRemaining(trialEndsAt?: string | null) {
  if (!trialEndsAt) return 0;

  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  const diff = end - now;

  if (diff <= 0) return 0;

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function TrialCountdownBanner({
  businessId,
  billingStatus,
  trialEndsAt,
}: TrialCountdownBannerProps) {
  if (billingStatus === "internal") return null;
  if (billingStatus === "active") return null;

  if (billingStatus === "trialing") {
    const daysRemaining = getDaysRemaining(trialEndsAt);

    return (
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white ring-1 ring-white/10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-mono tracking-wide text-white/45">
              DRIFT TRIAL
            </div>
            <div className="mt-1 text-sm text-white/85">
              {daysRemaining > 0
                ? `Monitoring active · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
                : "Trial expired · Upgrade to continue monitoring"}
            </div>
          </div>

          <Link
            href={`/upgrade?business_id=${businessId}`}
            className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#09306F]"
          >
            Upgrade to Continue Monitoring
          </Link>
        </div>
      </div>
    );
  }

  if (billingStatus === "expired" || billingStatus === "canceled") {
    return (
      <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-white ring-1 ring-red-500/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-mono tracking-wide text-white/45">
              BILLING STATUS
            </div>
            <div className="mt-1 text-sm text-white/85">
              Monitoring inactive · Upgrade to restore DRIFT signal coverage
            </div>
          </div>

          <Link
            href={`/upgrade?business_id=${businessId}`}
            className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#09306F]"
          >
            Upgrade Now
          </Link>
        </div>
      </div>
    );
  }

  return null;
}