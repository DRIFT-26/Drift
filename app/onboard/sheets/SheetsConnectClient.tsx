"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SheetsConnectClient({
  businessId,
}: {
  businessId: string;
  company: string;
  email: string;
  timezone: string;
}) {
  const router = useRouter();
  const [sheetUrl, setSheetUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!businessId) {
      alert("Missing business ID.");
      return;
    }

    if (!sheetUrl) {
      alert("Please paste a Google Sheet URL.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/sheets/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business_id: businessId,
          sheet_url: sheetUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Failed to connect Google Sheet.");
      }

      router.push("/onboard/success?business_id=${businessId}&signal=processing&source=google_sheets");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect Google Sheet.";
      alert(message);
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070B18] text-white">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <Link href="/onboard" className="text-sm text-white/70 hover:text-white">
          ← Back
        </Link>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.06] p-8 backdrop-blur-md">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect Google Sheet
          </h1>

          <p className="mt-3 text-sm text-white/65">
  Paste a Google Sheets link with either of the following formats:
</p>

<p className="mt-3 text-xs text-white/60">
  Single location:
  <br />
  <span className="text-white/80">Date,Revenue</span>
</p>

<p className="mt-2 text-xs text-white/60">
  Multiple locations:
  <br />
  <span className="text-white/80">Location,Date,Revenue</span>
</p>

<p className="mt-3 text-xs text-white/50">
  For the most accurate assessment and best results, include ~60 days of
  baseline revenue plus your most recent 14 days.
</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="text-xs text-white/60">Google Sheet URL</label>
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 focus:bg-white/7"
                required
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-semibold tracking-wide text-white/55">
                REQUIRED SHEET FORMAT
              </div>

              <pre className="mt-3 overflow-x-auto rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/75">
{`date,revenue
2026-01-01,1420
2026-01-02,1580
2026-01-03,1320`}
              </pre>

              <div className="mt-3 text-xs text-white/45">
                Set the sheet to{" "}
                <span className="text-white/65">Anyone with the link can view</span>.
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
            >
              {saving ? "Connecting..." : "Connect Google Sheet"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}