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

export const runtime = "nodejs";

export default function OnboardPage() {
  const router = useRouter();

  const [timezone, setTimezone] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [primaryRevenueSystem, setPrimaryRevenueSystem] = useState("stripe");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setTimezone(tz);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!company || !email || !timezone || !primaryRevenueSystem) {
      return;
    }

    setSubmitting(true);

    const params = new URLSearchParams({
      company,
      email,
      timezone,
      source: primaryRevenueSystem,
    });

    if (primaryRevenueSystem === "stripe") {
      router.push(`/api/stripe/connect?${params.toString()}`);
      return;
    }

    if (primaryRevenueSystem === "csv") {
      router.push(`/onboard/csv?${params.toString()}`);
      return;
    }

    setSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-[#070B18] text-white">
      {/* Top subtle glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-40 left-10 h-[260px] w-[260px] rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 py-14">
        {/* Minimal header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← Back
          </Link>

          <div className="text-xs text-white/55">
            DRIFT <span className="text-white/30">/ Founding Cohort</span>
          </div>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:items-start">
          {/* Left: message */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
              <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
              Limited Founding Cohort — 10 companies
            </div>

            <h1 className="mt-5 text-3xl md:text-4xl font-semibold tracking-tight">
              Join the Founding Cohort
            </h1>

            <p className="mt-4 text-white/70 leading-relaxed">
              DRIFT delivers executive output—quietly. Connect your primary revenue system and
              receive signal-level alerts when revenue deviates materially.
            </p>

            <div className="mt-6 space-y-3 text-sm text-white/70">
              <div className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
                <span>Automatic ingestion + drift detection (no dashboards to babysit).</span>
              </div>
              <div className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
                <span>Short, specific, actionable alerts—built for operators.</span>
              </div>
              <div className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/50" />
                <span>Founding members get priority access to upcoming integrations.</span>
              </div>
            </div>
          </div>

          {/* Right: form card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">Request access</div>
                  <div className="mt-1 text-xs text-white/55">
                    Takes ~30 seconds. You’ll be redirected to connect your system.
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
                    <option value="">Select your timezone</option>

                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value} className="text-black">
                        {tz.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-[11px] text-white/45">
                    Used for Monday 7:15am local weekly pulse + daily dispatch timing.
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/60">Primary revenue system</label>
                  <select
                    value={primaryRevenueSystem}
                    onChange={(e) => setPrimaryRevenueSystem(e.target.value)}
                    className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-white/25 focus:bg-white/7"
                    required
                  >
                    <option className="bg-[#070B18]" value="stripe">
                      Stripe
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

                  <p className="mt-3 text-xs text-white/40">
                    Stripe connections are available now. Additional revenue systems are being added for public launch. Early members may also upload revenue data via CSV. Founding members receive priority access to future integrations.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 w-full rounded-md bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-neutral-200 transition disabled:opacity-70"
                >
                  {submitting ? "Redirecting..." : "Join the Founding Cohort"}
                </button>

                <div className="text-[11px] text-white/45 leading-relaxed">
                  We don’t share your data. DRIFT only uses your connection to compute drift signals
                  and deliver alerts.
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* tiny footer */}
        <div className="mt-14 text-center text-xs text-white/35">
          © {new Date().getFullYear()} DRIFT
        </div>
      </div>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  const { label, name, placeholder, hint, type } = props;

  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/70">{label}</span>
        {hint ? <span className="text-[11px] text-white/40">{hint}</span> : null}
      </div>

      <input
        name={name}
        type={type ?? "text"}
        placeholder={placeholder}
        required
        className="mt-2 w-full rounded-md border border-white/10 bg-[#050B18]/40 px-3 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 focus:ring-2 focus:ring-[#0A2A66]/40"
      />
    </label>
  );
}