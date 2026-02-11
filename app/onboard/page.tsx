"use client";

import { useState } from "react";

export default function OnboardPage() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName || !email || !file) {
      setMessage("Please complete all fields.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("business_name", businessName);
    formData.append("email", email);
    formData.append("file", file);

    const res = await fetch("/api/onboard", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Something went wrong.");
    } else {
      setMessage("DRIFT is now monitoring your business. Check your email.");
      setBusinessName("");
      setEmail("");
      setFile(null);
    }

    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 480, margin: "60px auto", padding: 20 }}>
      <h1>Start Monitoring with DRIFT</h1>
      <p style={{ opacity: 0.7 }}>
        Upload your data and we’ll watch for early signs of customer trust decay.
      </p>

      <form onSubmit={handleSubmit}>
        <label>
          Business Name
          <input
            type="text"
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          />
        </label>

        <label>
          Alert Email
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          />
        </label>

        <label>
          Upload CSV (Reviews or Engagement)
          <input
            type="file"
            accept=".csv"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={{ width: "100%", marginBottom: 20 }}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Starting…" : "Start Monitoring"}
        </button>
      </form>

      {message && <p style={{ marginTop: 20 }}>{message}</p>}
    </div>
  );
}