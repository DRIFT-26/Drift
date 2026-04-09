// lib/auth/onboard-access.ts
import crypto from "crypto";

export const ONBOARD_ACCESS_COOKIE = "drift_onboard_access";

type OnboardAccessPayload = {
  email: string;
  exp: number;
};

function getSecret() {
  const secret =
    process.env.ONBOARD_ACCESS_SECRET || process.env.CRON_SECRET || "";

  if (!secret) {
    throw new Error("Missing ONBOARD_ACCESS_SECRET");
  }

  return secret;
}

function sign(raw: string) {
  return crypto.createHmac("sha256", getSecret()).update(raw).digest("base64url");
}

export function createOnboardAccessToken(email: string, maxAgeSeconds = 900) {
  const payload: OnboardAccessPayload = {
    email,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };

  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(raw);

  return `${raw}.${signature}`;
}

export function verifyOnboardAccessToken(token: string | undefined | null) {
  if (!token) return null;

  const [raw, signature] = token.split(".");
  if (!raw || !signature) return null;

  const expected = sign(raw);
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as OnboardAccessPayload;

    if (!payload?.email || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}