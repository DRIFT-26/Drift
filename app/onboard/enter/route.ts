import { NextResponse } from "next/server";
import {
  ONBOARD_ACCESS_COOKIE,
  verifyOnboardAccessToken,
} from "@/lib/auth/onboard-access";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const token = requestUrl.searchParams.get("token");
  const nextPath = requestUrl.searchParams.get("next");
  const payload = verifyOnboardAccessToken(token);

  if (!payload || !token) {
    return NextResponse.redirect(new URL("/login", requestUrl.origin));
  }

  const safeNext =
    nextPath && nextPath.startsWith("/app/alerts")
      ? nextPath
      : "/app/alerts";

  const res = NextResponse.redirect(new URL(safeNext, requestUrl.origin));

  res.cookies.set(ONBOARD_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 15,
  });

  return res;
}