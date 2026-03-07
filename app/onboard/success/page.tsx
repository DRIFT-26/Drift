import { Suspense } from "react";
import SuccessClient from "./SuccessClient";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    signal?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <Suspense fallback={null}>
      <SuccessClient signal={params.signal ?? ""} />
    </Suspense>
  );
}