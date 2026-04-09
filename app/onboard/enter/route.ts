import { NextResponse } from "next/server";
import {
  ONBOARD_ACCESS_COOKIE,
  verifyOnboardAccessToken,
} from "@/lib/auth/onboard-access";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const token = requestUrl.searchParams.get("token");
  const payload = verifyOnboardAccessToken(token);

  if (!payload || !token) {
    return NextResponse.redirect(new URL("/login", requestUrl.origin));
  }

  const res = NextResponse.redirect(new URL("/app/alerts", requestUrl.origin));

  res.cookies.set(ONBOARD_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 15,
  });

  return res;
}