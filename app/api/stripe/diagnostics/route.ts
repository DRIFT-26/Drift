import { NextResponse } from "next/server";

export const runtime = "nodejs";

function maskedValue(value: string) {
  if (!value) return null;
  if (value.length <= 10) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function stripeSecretMode(secretKey: string) {
  if (secretKey.startsWith("sk_live_")) return "live";
  if (secretKey.startsWith("sk_test_")) return "test";
  if (!secretKey) return "missing";
  return "unknown";
}

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://drifthq.co")
    .trim()
    .replace(/\/$/, "");
  const clientId = (process.env.STRIPE_CLIENT_ID || "").trim();
  const secretKey = (process.env.STRIPE_SECRET_KEY || "").trim();
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();

  return NextResponse.json({
    ok: true,
    stripe: {
      hasClientId: Boolean(clientId),
      clientIdPreview: maskedValue(clientId),
      clientIdLength: clientId.length,
      hasSecretKey: Boolean(secretKey),
      secretKeyMode: stripeSecretMode(secretKey),
      hasWebhookSecret: Boolean(webhookSecret),
      redirectUri: `${appUrl}/api/stripe/callback`,
    },
    vercel: {
      environment: process.env.VERCEL_ENV ?? "unknown",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    note:
      "This endpoint intentionally returns only present/missing flags, masked IDs, and mode. It does not expose Stripe secrets, webhook secrets, access tokens, or customer data.",
  });
}
