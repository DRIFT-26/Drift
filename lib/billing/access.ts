export function businessHasAccess(business: {
  billing_status: string | null;
  trial_ends_at?: string | null;
}) {
  if (business.billing_status === "internal") return true;
  if (business.billing_status === "active") return true;

  if (
    business.billing_status === "trialing" &&
    business.trial_ends_at &&
    new Date(business.trial_ends_at).getTime() > Date.now()
  ) {
    return true;
  }

  return false;
}