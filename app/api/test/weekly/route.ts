import { NextResponse } from "next/server";
import { renderWeeklyPulseEmail } from "@/lib/email/templates";

export async function GET() {
  const email = renderWeeklyPulseEmail({
    windowStart: "2026-03-01",
    windowEnd: "2026-03-07",
    billingStatus: "trialing",
    trialEndsAt: new Date(Date.now() + 5 * 86400000).toISOString(), // 5 days left
    businesses: [
      {
        id: "1",
        name: "Test Co",
        status: "attention",
        reason: "Revenue down 40%",
      },
    ],
  });

  console.log(email);

  return NextResponse.json(email);
}