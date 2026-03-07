import crypto from "crypto";

export function makeShareToken() {
  return crypto.randomBytes(16).toString("hex");
}