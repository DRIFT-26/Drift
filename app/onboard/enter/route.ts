import { NextResponse } from "next/server";
import {
  ONBOARD_ACCESS_COOKIE,
  verifyOnboardAccessToken,
} from "@/lib/auth/onboard-access";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL || "https://drifthq.co";

  const requestUrl = new URL(req.url);
  const token = requestUrl.searchParams.get("token");
  const payload = verifyOnboardAccessToken(token);

  if (!payload || !token) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const res = NextResponse.redirect(new URL("/app/alerts", origin));

  res.cookies.set(ONBOARD_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 15,
  });

  return res;
}