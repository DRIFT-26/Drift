import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "drift",
    env: process.env.VERCEL_ENV ?? "unknown",
    git: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    time: new Date().toISOString(),
  });
}