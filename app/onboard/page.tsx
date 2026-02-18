"use client";

import { useMemo, useState } from "react";

type SourceKind = "csv_reviews" | "csv_engagement";
type SentimentScale = "0_1" | "1_5";
type EngagementScale = "0_1" | "0_100" | "raw";

function normalizeGoogleSheetsCsvUrl(input: string) {
  const url = input.trim();
  if (!url) return "";

  // Already an export CSV URL
  if (url.includes("/export?format=csv")) return url;

  // Try to convert a normal Google Sheets URL into an export CSV URL
  // Examples:
  // https://docs.google.com/spreadsheets/d/<ID>/edit?gid=0#gid=0
  // https://docs.google.com/spreadsheets/d/<ID>/edit?usp=sharing
  try {
    const u = new URL(url);
    if (!u.hostname.includes("docs.google.com")) return url;

    const parts = u.pathname.split("/");
    const dIndex = parts.findIndex((p) => p === "d");
    const sheetId = dIndex >= 0 ? parts[dIndex + 1] : null;

    if (!sheetId) return url;

    // gid can appear in query or hash
    const gidFromQuery = u.searchParams.get("gid");
    const gidFromHash = (() => {
      const m = u.hash.match(/gid=(\d+)/);
      return m?.[1] ?? null;
    })();

    const gid = gidFromQuery || gidFromHash || "0";

    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  } catch {
    return url;
  }
}

function isProbablyUrl(v: string) {
  try {
    const u = new URL(v);
    return Boolean(u.protocol && u.host);
  } catch {
    return false;
  }
}

export default function OnboardPage() {
  // Business
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [monthlyRevenue, setMonthlyRevenue] = useState<string>(""); // dollars

  // Reviews source
  const [reviewsUrl, setReviewsUrl] = useState("");
  const [reviewsDateCol, setReviewsDateCol] = useState("date");
  const [ratingCol, setRatingCol] = useState("rating");
  const [sentimentScale, setSentimentScale] = useState<SentimentScale>("1_5");

  // Engagement source
  const [engUrl, setEngUrl] = useState("");
  const [engDateCol, setEngDateCol] = useState("date");
  const [engCol, setEngCol] = useState("engagement");
  const [engScale, setEngScale] = useState<EngagementScale>("0_100");

  // UX
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reviewsCsvUrl = useMemo(() => normalizeGoogleSheetsCsvUrl(reviewsUrl), [reviewsUrl]);
  const engagementCsvUrl = useMemo(() => normalizeGoogleSheetsCsvUrl(engUrl), [engUrl]);

  const canSubmit = useMemo(() => {
    if (!businessName.trim() || !email.trim()) return false;

    // Require at least one source (reviews OR engagement) for V1
    const hasReviews = reviewsCsvUrl && isProbablyUrl(reviewsCsvUrl);
    const hasEng = engagementCsvUrl && isProbablyUrl(engagementCsvUrl);

    return hasReviews || hasEng;
  }, [businessName, email, reviewsCsvUrl, engagementCsvUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!canSubmit) {
      setMessage("Please add your business info and connect at least one live data source.");
      return;
    }

    setLoading(true);

    const sources: Array<{ type: SourceKind; config: any }> = [];

    if (reviewsCsvUrl && isProbablyUrl(reviewsCsvUrl)) {
      sources.push({
        type: "csv_reviews",
        config: {
          csv_url: reviewsCsvUrl,
          date_column: reviewsDateCol.trim(),
          sentiment_column: ratingCol.trim(),
          sentiment_scale: sentimentScale,
        },
      });
    }

    if (engagementCsvUrl && isProbablyUrl(engagementCsvUrl)) {
      sources.push({
        type: "csv_engagement",
        config: {
          csv_url: engagementCsvUrl,
          date_column: engDateCol.trim(),
          engagement_column: engCol.trim(),
          engagement_scale: engScale,
        },
      });
    }

    const monthlyRevenueCents =
      monthlyRevenue.trim() && Number.isFinite(Number(monthlyRevenue))
        ? Math.max(0, Math.round(Number(monthlyRevenue) * 100))
        : null;

    const res = await fetch("/api/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: businessName.trim(),
        email: email.trim(),
        monthly_revenue_cents: monthlyRevenueCents,
        sources,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Something went wrong.");
      setLoading(false);
      return;
    }

    setMessage(
      "Connected. DRIFT is now monitoring quietly. We’ll alert you if revenue signals start to slip."
    );

    setBusinessName("");
    setEmail("");
    setMonthlyRevenue("");
    setReviewsUrl("");
    setEngUrl("");

    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 720, margin: "60px auto", padding: 20 }}>
      <h1 style={{ marginBottom: 6 }}>Start Monitoring</h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Connect a live data source. DRIFT updates automatically—no ongoing uploads.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        {/* Business */}
        <div
          style={{
            border: "1px solid #EAECF0",
            borderRadius: 14,
            padding: 14,
            background: "#FFF",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Business</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#475467" }}>Business name</span>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
                placeholder="Acme Coffee"
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#475467" }}>Alert email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
                placeholder="ops@acme.com"
                type="email"
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: "#475467" }}>
              Monthly revenue (optional, used for Estimated Revenue Impact)
            </span>
            <input
              value={monthlyRevenue}
              onChange={(e) => setMonthlyRevenue(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD", maxWidth: 260 }}
              placeholder="25000"
              inputMode="decimal"
            />
          </label>
        </div>

        {/* Reviews */}
        <div
          style={{
            border: "1px solid #EAECF0",
            borderRadius: 14,
            padding: 14,
            background: "#FFF",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>Reviews signal</div>
            <div style={{ fontSize: 12, color: "#667085" }}>
              Google Sheet link or CSV URL • DRIFT auto-converts Sheets to CSV
            </div>
          </div>

          <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 12, color: "#475467" }}>Sheet/CSV URL</span>
            <input
              value={reviewsUrl}
              onChange={(e) => setReviewsUrl(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=0#gid=0"
            />
            {reviewsUrl.trim() && (
              <span style={{ fontSize: 12, color: "#667085" }}>
                Export URL: <span style={{ fontFamily: "monospace" }}>{reviewsCsvUrl}</span>
              </span>
            )}
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#475467" }}>Date column</span>
              <input
                value={reviewsDateCol}
                onChange={(e) => setReviewsDateCol(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#475467" }}>Rating column</span>
              <input
                value={ratingCol}
                onChange={(e) => setRatingCol(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#475467" }}>Scale</span>
              <select
                value={sentimentScale}
                onChange={(e) => setSentimentScale(e.target.value as SentimentScale)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
              >
                <option value="1_5">1–5 stars</option>
                <option value="0_1">0–1</option>
              </select>
            </label>
          </div>
        </div>

        {/* Engagement */}
        <div
          style={{
            border: "1px solid #EAECF0",
            borderRadius: 14,
            padding: 14,
            background: "#FFF",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>Engagement signal</div>
            <div style={{ fontSize: 12, color: "#667085" }}>Optional for V1 • improves momentum accuracy</div>
          </div>

          <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 12, color: "#475467" }}>Sheet/CSV URL</span>
            <input
              value={engUrl}
              onChange={(e) => setEngUrl(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=0#gid=0"
            />
            {engUrl.trim() && (
              <span style={{ fontSize: 12, color: "#667085" }}>
                Export URL: <span style={{ fontFamily: "monospace" }}>{engagementCsvUrl}</span>
              </span>
            )}
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#475467" }}>Date column</span>
              <input
                value={engDateCol}
                onChange={(e) => setEngDateCol(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#475467" }}>Engagement column</span>
              <input
                value={engCol}
                onChange={(e) => setEngCol(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#475467" }}>Scale</span>
              <select
                value={engScale}
                onChange={(e) => setEngScale(e.target.value as EngagementScale)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #D0D5DD" }}
              >
                <option value="0_100">0–100</option>
                <option value="0_1">0–1</option>
                <option value="raw">Raw</option>
              </select>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !canSubmit}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #D0D5DD",
            background: loading ? "#F2F4F7" : "#101828",
            color: loading ? "#667085" : "#FFFFFF",
            fontWeight: 800,
            cursor: loading || !canSubmit ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Connecting…" : "Connect & Start Monitoring"}
        </button>

        {message && (
          <div style={{ padding: 12, borderRadius: 12, background: "#F2F4F7", color: "#101828" }}>
            {message}
          </div>
        )}
      </form>

      <div style={{ marginTop: 18, fontSize: 12, color: "#667085", lineHeight: 1.5 }}>
        <strong>Column naming:</strong> keep headers clean and lowercase if possible (e.g. <code>date</code>,{" "}
        <code>rating</code>, <code>engagement</code>). Dates should be <code>YYYY-MM-DD</code> or ISO-like strings.
      </div>
    </div>
  );
}