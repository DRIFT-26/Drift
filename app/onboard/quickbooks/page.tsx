import { Suspense } from "react";
import QuickBooksConnectClient from "./QuickBooksConnectClient";

export default async function QuickBooksPage({
  searchParams,
}: {
  searchParams: Promise<{
    business_id?: string;
    company?: string;
    email?: string;
    timezone?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <Suspense fallback={null}>
      <QuickBooksConnectClient
        businessId={params.business_id ?? ""}
        company={params.company ?? ""}
        email={params.email ?? ""}
        timezone={params.timezone ?? ""}
        error={params.error ?? ""}
      />
    </Suspense>
  );
}
