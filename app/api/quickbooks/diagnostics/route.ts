import { NextResponse } from "next/server";
import { getQuickBooksPublicConfig } from "@/lib/quickbooks/client";

export const runtime = "nodejs";

export async function GET() {
  const config = getQuickBooksPublicConfig();

  return NextResponse.json({
    ok: true,
    quickbooks: config,
    vercel: {
      environment: process.env.VERCEL_ENV ?? "unknown",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    note:
      "This endpoint intentionally returns only public URLs and present/missing flags. It does not expose client IDs, secrets, access tokens, refresh tokens, or customer data.",
  });
}
