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

  return (
    <main className="min-h-screen bg-[#070B18] px-8 py-12 text-white">
      <h1 className="text-3xl font-semibold tracking-tight">
        DRIFT Control Panel
      </h1>
      <p className="mt-2 text-sm text-white/60">
        Internal visibility into businesses, signal activity, and system readiness.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs text-white/45">CONNECTED BUSINESSES</div>
          <div className="mt-2 text-3xl font-semibold">
            {businesses?.length ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs text-white/45">RECENT SIGNALS</div>
          <div className="mt-2 text-3xl font-semibold">
            {alerts?.length ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs text-white/45">SYSTEM STATUS</div>
          <div className="mt-2 text-3xl font-semibold">Live</div>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Connected Businesses</h2>
        <p className="mt-1 text-sm text-white/50">
          A live view of the businesses currently connected to DRIFT.
        </p>

        <div className="mt-4 space-y-3">
          {businesses?.map((b) => (
            <div
              key={b.id}
              className="rounded-lg border border-white/10 bg-white/5 p-4"
            >
              <div className="text-sm font-semibold">{b.name}</div>

              <div className="mt-1 text-xs text-white/60">
                {b.alert_email ?? "No email on file"}
              </div>

              <div className="mt-3 space-y-1 text-xs text-white/60">
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
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-lg font-semibold">Recent Signal Activity</h2>
        <p className="mt-1 text-sm text-white/50">
          The latest signals DRIFT has surfaced across connected businesses.
        </p>

        <div className="mt-4 space-y-3">
          {alerts?.map((a, i) => (
            <div
              key={i}
              className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70"
            >
              <div className="font-medium text-white">
                {signalLabel(a.status)}
              </div>
              <div className="mt-1 text-xs text-white/50">
                Business ID: {a.business_id}
              </div>
              <div className="mt-1 text-xs text-white/50">
                Detected: {formatDateTime(a.created_at) ?? "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}