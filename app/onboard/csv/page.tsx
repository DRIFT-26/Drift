import { Suspense } from "react";
import CsvUploadClient from "./CsvUploadClient";

export default async function CsvPage({
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
      <CsvUploadClient
        businessId={params.business_id ?? ""}
        company={params.company ?? ""}
        email={params.email ?? ""}
        timezone={params.timezone ?? ""}
      />
    </Suspense>
  );
}