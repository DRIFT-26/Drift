import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";

function formatDateTime(value?: string | null) {
  if (!value) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleString(undefined, {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function signalLabel(status?: string | null) {
  const s = String(status ?? "").toLowerCase();

  if (s === "attention") return "Immediate Attention";
  if (s === "softening") return "Softening";
  if (s === "watch") return "Watch";
  if (s === "movement") return "Momentum Detected";
  return "Stable";
}

function signalColor(status?: string | null) {
  const s = String(status ?? "").toLowerCase();

  if (s === "attention") return "text-red-400";
  if (s === "softening") return "text-orange-300";
  if (s === "watch") return "text-yellow-300";
  if (s === "movement") return "text-sky-300";
  return "text-green-300";
}

function alertBusinessName(businesses: any) {
  if (!businesses) return "Unknown business";

  if (Array.isArray(businesses)) {
    return businesses[0]?.name ?? "Unknown business";
  }

  return businesses.name ?? "Unknown business";
}

function getBusinessReadiness(args: {
  lastIngestedAt?: string | null;
  lastComputedAt?: string | null;
}) {
  const hasIngest = Boolean(args.lastIngestedAt);
  const hasComputed = Boolean(args.lastComputedAt);

  if (hasIngest && hasComputed) {
    return {
      label: "Ready",
      className: "text-green-300",
      detail: "Data is flowing and DRIFT has evaluated it.",
    };
  }

  if (hasIngest && !hasComputed) {
    return {
      label: "Processing",
      className: "text-yellow-300",
      detail: "Data has been received. Waiting on signal evaluation.",
    };
  }

  return {
    label: "Needs Setup",
    className: "text-orange-300",
    detail: "No recent data has been received yet.",
  };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const params = await searchParams;

  const adminKey = (params.key || "").trim();
  const expectedKey = (process.env.ADMIN_PAGE_SECRET || "").trim();

  if (!expectedKey || adminKey !== expectedKey) {
    notFound();
  }

  const supabase = supabaseAdmin();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id,name,alert_email,timezone,last_ingested_at,last_computed_at")
    .order("created_at", { ascending: false });

  const { data: alerts } = await supabase
    .from("alerts")
    .select("business_id,status,created_at,businesses(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const businessRows = businesses ?? [];
  const alertRows = alerts ?? [];

  const readyCount = businessRows.filter((b) => b.last_ingested_at && b.last_computed_at).length;
  const setupCount = businessRows.filter((b) => !b.last_ingested_at).length;

  return (
    <main className="min-h-screen bg-[#070B18] px-8 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          DRIFT Control Panel
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Internal visibility into connected businesses, recent signal activity, and overall system readiness.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs tracking-wide text-white/45">
              CONNECTED BUSINESSES
            </div>
            <div className="mt-2 text-3xl font-semibold">
              {businessRows.length}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs tracking-wide text-white/45">
              RECENT SIGNALS
            </div>
            <div className="mt-2 text-3xl font-semibold">
              {alertRows.length}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs tracking-wide text-white/45">
              READY FOR DRIFT
            </div>
            <div className="mt-2 text-3xl font-semibold">
              {readyCount}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs tracking-wide text-white/45">
              NEEDING SETUP
            </div>
            <div className="mt-2 text-3xl font-semibold">
              {setupCount}
            </div>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-semibold">Connected Businesses</h2>
          <p className="mt-1 text-sm text-white/50">
            A live view of the businesses currently connected to DRIFT and whether data is flowing cleanly.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {businessRows.map((b) => {
              const readiness = getBusinessReadiness({
                lastIngestedAt: b.last_ingested_at,
                lastComputedAt: b.last_computed_at,
              });

              return (
                <div
                  key={b.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {b.name}
                      </div>
                      <div className="mt-1 truncate text-xs text-white/60">
                        {b.alert_email ?? "No email on file"}
                      </div>
                    </div>

                    <div
                      className={`shrink-0 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium ${readiness.className}`}
                    >
                      {readiness.label}
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-white/60">
                    <div>Time zone: {b.timezone ?? "Not set"}</div>
                    <div>
                      Last data received:{" "}
                      {formatDateTime(b.last_ingested_at) ?? "No data received yet"}
                    </div>
                    <div>
                      Last signal check:{" "}
                      {formatDateTime(b.last_computed_at) ?? "No signal check yet"}
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/50">
                    {readiness.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-lg font-semibold">Recent Signal Activity</h2>
          <p className="mt-1 text-sm text-white/50">
            The latest signals DRIFT has surfaced across connected businesses.
          </p>

          <div className="mt-4 space-y-3">
            {alertRows.map((a, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${signalColor(a.status)}`}>
                      {signalLabel(a.status)}
                    </div>
                    <div className="mt-1 text-xs text-white/55">
                      Business: {alertBusinessName((a as any).businesses)}
                    </div>
                    <div className="mt-1 text-xs text-white/40">
                      ID: {a.business_id}
                    </div>
                  </div>

                  <div className="shrink-0 text-xs text-white/50">
                    {formatDateTime(a.created_at) ?? "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}