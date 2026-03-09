import { Suspense } from "react";
import SheetsConnectClient from "./SheetsConnectClient";

export default async function SheetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    business_id?: string;
    company?: string;
    email?: string;
    timezone?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <Suspense fallback={null}>
      <SheetsConnectClient
        businessId={params.business_id ?? ""}
        company={params.company ?? ""}
        email={params.email ?? ""}
        timezone={params.timezone ?? ""}
      />
    </Suspense>
  );
}