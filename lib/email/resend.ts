import { Resend } from "resend";

export async function sendDriftEmail(params: {
  to: string;
  subject: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY missing at runtime");

  const resend = new Resend(apiKey);

  const from = "DRIFT <onboarding@resend.dev>";

  const result = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });

  // If Resend returns an error object, surface it
  const maybeError = (result as any)?.error;
  if (maybeError) {
    throw new Error(`Resend error: ${maybeError?.message ?? JSON.stringify(maybeError)}`);
  }

  return result;
}