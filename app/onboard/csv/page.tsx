import { Suspense } from "react";
import CsvUploadClient from "./CsvUploadClient";

export default async function CsvPage({
  searchParams,
}: {
  searchParams: Promise<{
    company?: string;
    email?: string;
    timezone?: string;
    source?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <Suspense fallback={null}>
      <CsvUploadClient
        company={params.company ?? ""}
        email={params.email ?? ""}
        timezone={params.timezone ?? ""}
      />
    </Suspense>
  );
}