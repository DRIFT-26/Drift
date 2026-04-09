// app/onboard/enter/route.ts
import { NextResponse } from "next/server";
import {
  ONBOARD_ACCESS_COOKIE,
  verifyOnboardAccessToken,
} from "@/lib/auth/onboard-access";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const payload = verifyOnboardAccessToken(token);

  if (!payload || !token) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const res = NextResponse.redirect(new URL("/app/alerts", url.origin));

  res.cookies.set(ONBOARD_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 15,
  });

  return res;
}