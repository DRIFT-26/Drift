"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET) — America/New_York" },
  { value: "America/Chicago", label: "Central (CT) — America/Chicago" },
  { value: "America/Denver", label: "Mountain (MT) — America/Denver" },
  { value: "America/Los_Angeles", label: "Pacific (PT) — America/Los_Angeles" },
  { value: "America/Phoenix", label: "Arizona — America/Phoenix" },
  { value: "America/Anchorage", label: "Alaska — America/Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii — Pacific/Honolulu" },
] as const;

export default function OnboardPage() {
  const router = useRouter();

  const [timezone, setTimezone] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("stripe");
  const [revenueFormat, setRevenueFormat] = useState<"single" | "multi">("single");
  const [submitting, setSubmitting] = useState(false);
  const [isAddBusiness, setIsAddBusiness] = useState(false);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setTimezone(tz);

    const params = new URLSearchParams(window.location.search);
    setIsAddBusiness(params.get("mode") === "add_business");
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    if (!company || !email || !timezone || !source) {
      alert("Please complete all required fields.");
      return;
    }

    setSubmitting(true);

    try {
      const onboardUrl = `${window.location.origin}/api/onboard`;

      const res = await fetch(onboardUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company,
          email: email.trim().toLowerCase(),
          timezone,
          source,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok || !data?.business_id) {
        throw new Error(data?.error ?? "Failed to start onboarding.");
      }

      const businessId = String(data.business_id);

      if (source === "stripe") {
        router.push(
          `/api/stripe/connect?business_id=${encodeURIComponent(businessId)}`
        );
        return;
      }

      if (source === "google_sheets") {
        router.push(
          `/onboard/sheets?business_id=${encodeURIComponent(
            businessId
          )}&company=${encodeURIComponent(company)}&email=${encodeURIComponent(
            email
          )}&timezone=${encodeURIComponent(timezone)}`
        );
        return;
      }

      router.push(
        `/onboard/csv?business_id=${encodeURIComponent(
          businessId
        )}&company=${encodeURIComponent(company)}&email=${encodeURIComponent(
          email
        )}&timezone=${encodeURIComponent(timezone)}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      alert(message);
      setSubmitting(false);
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
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-40 left-10 h-[260px] w-[260px] rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-14">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← Back
          </Link>

          <div className="text-xs text-white/55">
            DRIFT <span className="text-white/30">/ Founding Cohort</span>
          </div>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
              <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
              Limited Founding Cohort — 10 companies
            </div>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
              {isAddBusiness ? "Add another business to DRIFT" : "Join the Founding Cohort"}
            </h1>

            <p className="mt-4 leading-relaxed text-white/70">
              {isAddBusiness
              ? "Add another business to your DRIFT portfolio. Monitoring begins as soon as your revenue source is connected."
              : "Connect your revenue source and DRIFT will begin monitoring for meaningful changes in performance — then alert you when something needs attention."}
            </p>

            <div className="mt-6 space-y-3 text-sm text-white/70">
              <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>DRIFT monitors your revenue quietly in the background.</span>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>You only hear from it when something meaningfully changes.</span>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>Built for single-location operators and multi-location groups.</span>
            </div>
            <div className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
              <span>Founding members get priority access to upcoming integrations and features.</span>
            </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">Start Monitoring Setup</div>
                  <div className="mt-1 text-xs text-white/55">
                    Takes ~30 seconds. You’ll choose your revenue source next.
                  </div>
                </div>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="text-xs text-white/60">Company</label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 focus:bg-white/7"
                    placeholder="Acme Holdings"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-white/60">Work email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 focus:bg-white/7"
                    placeholder="name@company.com"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-white/60">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none"
                    required
                  >
                    <option value="">Select Your Timezone</option>
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value} className="text-black">
                        {tz.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-[11px] text-white/45">
                    Used to time your alerts and weekly pulse correctly.
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs text-white/45">
                    If you can export daily sales, you’re ready.
                  </p>
                  <label className="text-xs text-white/60">Choose how you want to connect</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-white/25 focus:bg-white/7"
                    required
                  >
                    <option className="bg-[#070B18]" value="stripe">
                      Stripe
                    </option>
                    <option className="bg-[#070B18]" value="google_sheets">
                      Google Sheets
                    </option>
                    <option className="bg-[#070B18]" value="csv">
                      CSV
                    </option>
                    <option className="bg-[#070B18]" value="quickbooks" disabled>
                      QuickBooks (coming soon)
                    </option>
                    <option className="bg-[#070B18]" value="toast" disabled>
                      Toast (coming soon)
                    </option>
                    <option className="bg-[#070B18]" value="shopify" disabled>
                      Shopify (coming soon)
                    </option>
                    <option className="bg-[#070B18]" value="square" disabled>
                      Square (coming soon)
                    </option>
                  </select>

                  <p className="mt-3 text-xs text-white/45">
                    Stripe is the fastest direct connection. Google Sheets is best if your POS exports or syncs daily revenue. CSV works well for quick setup and historical onboarding.
                  </p>

                  <p className="mt-2 text-[11px] text-white/35">
                    Accepted CSV format:
                    <br />
                    <span className="text-white/50">Date,Revenue</span>
                    <br />
                    <span className="text-white/50">Location,Date,Revenue</span>
                  </p>

                  <p className="mt-2 text-[11px] text-white/35">
                    Best results come from including about 60 days of historical revenue plus your most recent 14 days.
                  </p>

                  {(source === "csv" || source === "google_sheets") && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs font-semibold tracking-wide text-white/55">
                        REVENUE FORMAT
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRevenueFormat("single")}
                          className={`rounded-md px-3 py-2 text-xs transition ${
                            revenueFormat === "single"
                              ? "bg-white text-black"
                              : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          Single Location
                        </button>

                        <button
                          type="button"
                          onClick={() => setRevenueFormat("multi")}
                          className={`rounded-md px-3 py-2 text-xs transition ${
                            revenueFormat === "multi"
                              ? "bg-white text-black"
                              : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          Multiple Locations
                        </button>
                      </div>

                      <div className="mt-3 text-[11px] text-white/45">
                        {revenueFormat === "single" ? (
                          <>
                            Expected Format:
                            <br />
                            <span className="text-white/60">Date,Revenue</span>
                          </>
                        ) : (
                          <>
                            Expected Format:
                            <br />
                            <span className="text-white/60">Location,Date,Revenue</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="mt-2 text-[11px] text-white/40">
                    Need a simple format to follow?{" "}
                    <a
                      href="/drift-revenue-template.csv"
                      download
                      className="text-white/60 underline underline-offset-4 hover:text-white"
                    >
                      View DRIFT revenue template
                    </a>
                  </p>

                  {source === "google_sheets" && (
                  <p className="mt-2 text-[11px] text-white/45">
                      Best for operators using Toast, Aloha, Square, Clover, QuickBooks, Shopify, or any system that can send daily revenue into a sheet.
                  </p>
                  )}
                  {source === "google_sheets" && (
                  <p className="mt-2 text-[11px] text-white/40">
                      Using another POS? Zapier can send your daily revenue into Google Sheets automatically.
                  </p>
                  )}
                </div>

                <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold tracking-wide text-white/55">
                    WHAT HAPPENS NEXT
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-white/70">
                    <div className="flex gap-3">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
                      <span>DRIFT connects to your revenue data.</span>
                    </div>

                    <div className="flex gap-3">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
                      <span>DRIFT establishes a baseline for your business.</span>
                    </div>

                    <div className="flex gap-3">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
                      <span>You only receive alerts when something meaningfully changes.</span>
                    </div>
                  </div>
                </div>

                <button
  type="submit"
  disabled={submitting}
  className="mt-2 w-full rounded-md bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-70"
  style={
    submitting
      ? {
          animation: "driftPulse 1.8s ease-in-out infinite",
        }
      : undefined
  }
>
  {submitting ? "Redirecting..." : "Continue Setup"}
</button>

                <div className="text-[11px] leading-relaxed text-white/45">
                  We don’t share your data. DRIFT only uses your connection to compute drift
                  signals and deliver alerts.
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="mt-14 text-center text-xs text-white/35">
          © {new Date().getFullYear()} DRIFT
        </div>
      </div>
    </main>
  );
}