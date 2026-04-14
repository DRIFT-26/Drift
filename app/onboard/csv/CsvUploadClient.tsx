"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CsvUploadClient({
  businessId,
  company,
  email,
  timezone,
}: {
  businessId: string;
  company: string;
  email: string;
  timezone: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!file) {
      alert("Please select a CSV file.");
      return;
    }

    if (!businessId) {
      alert("Missing business ID.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("business_id", businessId);
      formData.append("company", company);
      formData.append("email", email);
      formData.append("timezone", timezone);

      const res = await fetch("/api/csv/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json().catch(() => null)) as {
  ok?: boolean;
  error?: string;
  touched_business_ids?: string[];
} | null;

const touched = Array.isArray(data?.touched_business_ids)
  ? data.touched_business_ids.join(",")
  : "";

console.log("CSV businessId before success redirect:", businessId);
console.log("CSV touched ids before success redirect:", touched);

if (!res.ok || !data?.ok) {
  throw new Error(data?.error ?? "Upload failed. Please check your file and try again");
}

router.push(
  `/onboard/success?business_id=${businessId}&signal=processing&source=csv_debug&touched_business_ids=${encodeURIComponent(touched)}&debug_redirect=1`
);

    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed. Please check your file and try again";
      alert(message);
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070B18] text-white">
      <style>{`
  @keyframes driftPulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 rgba(56, 189, 248, 0);
      opacity: 0.9;
    }
    50% {
      transform: scale(1.015);
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.18);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 rgba(56, 189, 248, 0);
      opacity: 0.9;
    }
  }
`}</style>
      <div className="mx-auto max-w-3xl px-6 py-20">
        <Link href="/onboard" className="text-sm text-white/70 hover:text-white">
          ← Back
        </Link>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.06] p-8 backdrop-blur-md">
          <h1 className="text-2xl font-semibold tracking-tight">
            Upload Your Revenue Data
          </h1>

          <p className="mt-3 text-sm text-white/65">
            Upload a CSV export from your revenue system. DRIFT will use it to
            compute baseline behavior and generate your first signal.
          </p>
          <p className="mt-2 text-xs text-white/45">
            If your file includes daily revenue, you’re ready.
          </p>
          <p className="mt-1 text-[11px] text-white/40">
            Don’t worry about perfect formatting — DRIFT will handle minor inconsistencies.
          </p>

          <form onSubmit={handleUpload} className="mt-8 space-y-5">
            <div>
              <label className="text-xs text-white/60">
            CSV File
          </label>
            <p className="mt-1 text-[11px] text-white/40">
            Export from your POS, accounting system, or spreadsheet
            </p>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-white file:mr-3 file:rounded file:border-0 file:bg-white file:px-3 file:py-2 file:text-black"
                required
              />
            </div>

            <p className="text-[11px] text-white/40">
            You’ll see your first DRIFT signal immediately after upload.
            </p>

            <button
              type="submit"
              disabled={uploading}
              className="w-full rounded-md bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-60"
              style={
                uploading
                  ? {
                      animation: "driftPulse 1.8s ease-in-out infinite",
                    }
                  : undefined
              }
            >
              {uploading ? "Reading your data..." : "Upload CSV"}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
  <div className="text-xs font-semibold tracking-wide text-white/55">
    EXPECTED CSV FORMAT
  </div>

  <div className="mt-3 grid gap-3 md:grid-cols-2">
    <div>
      <div className="text-[11px] font-semibold text-white/50">Required Columns</div>
      <ul className="mt-2 space-y-1 text-sm text-white/75">
        <li>• Date</li>
        <li>• Revenue</li>
      </ul>
    </div>

    <div>
      <div className="text-[11px] font-semibold text-white/50">Example</div>
      <pre className="mt-2 overflow-x-auto rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/75">
{`date,revenue
2026-01-01,1420
2026-01-02,1580
2026-01-03,1320`}
      </pre>
    </div>
  </div>
</div>

          <div className="mt-4 text-xs text-white/45">
  DRIFT works best with a simple two-column CSV: <span className="text-white/65">DATE</span> and <span className="text-white/65">REVENUE</span>.
</div>
        </div>
      </div>
    </main>
  );
}