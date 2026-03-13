import { supabaseAdmin } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = supabaseAdmin();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id,name,alert_email,timezone,last_ingested_at,last_computed_at")
    .order("created_at", { ascending: false });

  const { data: alerts } = await supabase
    .from("alerts")
    .select("business_id,status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="min-h-screen bg-[#070B18] text-white px-8 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">DRIFT Admin</h1>

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Businesses</h2>

        <div className="mt-4 space-y-3">
          {businesses?.map((b) => (
            <div
              key={b.id}
              className="rounded-lg border border-white/10 bg-white/5 p-4"
            >
              <div className="text-sm font-semibold">{b.name}</div>

              <div className="text-xs text-white/60 mt-1">
                {b.alert_email}
              </div>

              <div className="text-xs text-white/50 mt-1">
                TZ: {b.timezone ?? "—"}
              </div>

              <div className="text-xs text-white/50 mt-1">
                Last Ingest: {b.last_ingested_at ?? "—"}
              </div>

              <div className="text-xs text-white/50">
                Last Compute: {b.last_computed_at ?? "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-lg font-semibold">Recent Signals</h2>

        <div className="mt-4 space-y-2">
          {alerts?.map((a, i) => (
            <div
              key={i}
              className="text-xs text-white/60 border-b border-white/10 pb-2"
            >
              {a.business_id} — {a.status} — {a.created_at}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}