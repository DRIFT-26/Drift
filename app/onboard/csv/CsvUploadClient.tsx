"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CsvUploadClient({
  company,
  email,
  timezone,
}: {
  company: string;
  email: string;
  timezone: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();

    if (!file) return;

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("company", company);
    formData.append("email", email);
    formData.append("timezone", timezone);

    const res = await fetch("/api/csv/upload", {
      method: "POST",
      body: formData,
    });

    setUploading(false);

    if (!res.ok) {
      alert("Upload failed.");
      return;
    }

    router.push("/onboard/success?signal=processing");
  }

  return (
    <main className="min-h-screen bg-[#070B18] text-white">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <Link href="/onboard" className="text-sm text-white/70 hover:text-white">
          ← Back
        </Link>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.06] p-8 backdrop-blur-md">
          <h1 className="text-2xl font-semibold tracking-tight">
            Upload Revenue Data
          </h1>

          <p className="mt-3 text-sm text-white/65">
            Upload a CSV export from your revenue system. DRIFT will use it to
            compute baseline behavior and generate your first signal.
          </p>

          <form onSubmit={handleUpload} className="mt-8 space-y-5">
            <div>
              <label className="text-xs text-white/60">CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-white file:mr-3 file:rounded file:border-0 file:bg-white file:px-3 file:py-2 file:text-black"
                required
              />
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="w-full rounded-md bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-neutral-200 transition disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Upload CSV"}
            </button>
          </form>

          <div className="mt-6 text-xs text-white/45">
            CSV should include revenue and date fields.
          </div>
        </div>
      </div>
    </main>
  );
}