import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type LoginEventRow = {
  email: string | null;
  user_id: string | null;
  created_at: string | null;
};

type BusinessRow = {
  id: string;
  name: string;
  alert_email: string | null;
  billing_status: string | null;
  created_at: string | null;
};

function normalizeEmails(raw?: string | null) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function isWithinDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoff;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function UsagePage() {
  const authClient = await createClient();
  const supabase = supabaseAdmin();

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const internalEmails = normalizeEmails(process.env.INTERNAL_USAGE_EMAILS);
  const isInternal = internalEmails.includes(user.email.toLowerCase());

  if (!isInternal) {
    redirect("/app/alerts");
  }

  const [{ data: loginEvents }, { data: businesses }] = await Promise.all([
    supabase
      .from("login_events")
      .select("email,user_id,created_at")
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<LoginEventRow[]>(),
    supabase
      .from("businesses")
      .select("id,name,alert_email,billing_status,created_at")
      .order("created_at", { ascending: false })
      .returns<BusinessRow[]>(),
  ]);

  const logins = loginEvents ?? [];
  const businessRows = businesses ?? [];

  const logins7d = logins.filter((l) => isWithinDays(l.created_at, 7));
  const uniqueUsers7d = new Set(
    logins7d.map((l) => (l.email || "").toLowerCase()).filter(Boolean)
  ).size;

  const businesses7d = businessRows.filter((b) => isWithinDays(b.created_at, 7)).length;

  const activeCount = businessRows.filter((b) => b.billing_status === "active").length;
  const trialingCount = businessRows.filter((b) => b.billing_status === "trialing").length;
  const expiredCount = businessRows.filter((b) => b.billing_status === "expired").length;
  const internalCount = businessRows.filter((b) => b.billing_status === "internal").length;

  const operatorCount = new Set(
    businessRows.map((b) => (b.alert_email || "").toLowerCase()).filter(Boolean)
  ).size;

  const topUsersMap = new Map<string, number>();
  for (const row of logins) {
    const email = (row.email || "").toLowerCase().trim();
    if (!email) continue;
    topUsersMap.set(email, (topUsersMap.get(email) || 0) + 1);
  }

  const topUsers = [...topUsersMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const recentLogins = logins.slice(0, 20);

  return (
    <main className="min-h-screen bg-[#0B1220] px-6 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono tracking-wide text-white/45">
              INTERNAL USAGE
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              DRIFT Usage Dashboard
            </h1>
            <div className="mt-2 text-sm text-white/60">
              Internal beta activity and operator usage signals
            </div>
          </div>

          <Link
            href="/app/alerts"
            className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back to Command Center
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs text-white/45">TOTAL LOGINS</div>
            <div className="mt-2 text-3xl font-semibold">{logins.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs text-white/45">LOGINS (7D)</div>
            <div className="mt-2 text-3xl font-semibold">{logins7d.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs text-white/45">UNIQUE USERS (7D)</div>
            <div className="mt-2 text-3xl font-semibold">{uniqueUsers7d}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs text-white/45">OPERATORS</div>
            <div className="mt-2 text-3xl font-semibold">{operatorCount}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs text-white/45">BUSINESSES</div>
            <div className="mt-2 text-2xl font-semibold">{businessRows.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs text-white/45">NEW BUSINESSES (7D)</div>
            <div className="mt-2 text-2xl font-semibold">{businesses7d}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs text-white/45">ACTIVE</div>
            <div className="mt-2 text-2xl font-semibold">{activeCount}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs text-white/45">TRIALING</div>
            <div className="mt-2 text-2xl font-semibold">{trialingCount}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs text-white/45">EXPIRED / INTERNAL</div>
            <div className="mt-2 text-2xl font-semibold">
              {expiredCount + internalCount}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-xs font-mono tracking-wide text-white/45">
              TOP USERS
            </div>
            <div className="mt-4 space-y-3">
              {topUsers.length ? (
                topUsers.map(([email, count]) => (
                  <div
                    key={email}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                  >
                    <div className="text-sm text-white/80">{email}</div>
                    <div className="text-sm font-semibold text-white">{count}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/50">No login activity yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-xs font-mono tracking-wide text-white/45">
              RECENT LOGINS
            </div>
            <div className="mt-4 space-y-3">
              {recentLogins.length ? (
                recentLogins.map((row, idx) => (
                  <div
                    key={`${row.user_id ?? "anon"}-${row.created_at ?? idx}`}
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                  >
                    <div className="text-sm font-semibold text-white">
                      {row.email || "Unknown user"}
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {formatDateTime(row.created_at)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/50">No login activity yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}