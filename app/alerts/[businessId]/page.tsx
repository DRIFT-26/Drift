import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import UpgradeButton from "../UpgradeButton";
import SendTestSummaryButton from "./SendTestSummaryButton";
import { projectRisk, estimateRevenueImpact } from "@/lib/drift/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatMoney(cents: number) {
  const dollars = (cents ?? 0) / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v);
  }
}

export default async function BusinessAlertsPage({
  params,
}: {
  params: { businessId: string };
}) {
  const businessId = params?.businessId;

  if (!businessId) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Alerts</h2>
        <p style={{ color: "#b42318" }}>Missing businessId in route params.</p>
      </div>
    );
  }

  const supabase = supabaseAdmin();

  // NOTE: use the columns that exist in YOUR DB. You currently have monthly_revenue (dollars),
  // not monthly_revenue_cents (you saw that error earlier).
  const { data: business, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,is_paid,alert_email,timezone,last_drift,last_drift_at,monthly_revenue")
    .eq("id", businessId)
    .maybeSingle();

  if (bErr) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Alerts</h2>
        <p style={{ color: "#b42318" }}>Failed to load business: {bErr.message}</p>
      </div>
    );
  }

  if (!business) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Alerts</h2>
        <p style={{ color: "#b42318" }}>Business not found.</p>
      </div>
    );
  }

  const { data: alerts, error: aErr } = await supabase
    .from("alerts")
    .select("id,status,reasons,window_start,window_end,created_at,meta")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (aErr) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Alerts</h2>
        <p style={{ color: "#b42318" }}>Failed to load alerts: {aErr.message}</p>
      </div>
    );
  }

  const isPaid = (business as any).is_paid === true;
  const lastDrift = (business as any).last_drift ?? null;

  // Revenue impact expects cents. Your business.monthly_revenue is dollars.
  const monthlyRevenueDollars =
    typeof (business as any)?.monthly_revenue === "number" ? (business as any).monthly_revenue : null;
  const monthlyRevenueCents =
    monthlyRevenueDollars && monthlyRevenueDollars > 0 ? Math.round(monthlyRevenueDollars * 100) : null;

  const risk = projectRisk(lastDrift);
  const impact = estimateRevenueImpact({
    monthlyRevenueCents,
    drift: lastDrift,
  });

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "#667085" }}>Alerts</div>
          <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.4 }}>{business.name}</h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Business ID: <code>{businessId}</code>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SendTestSummaryButton businessId={businessId} />
          {!isPaid ? <UpgradeButton businessId={businessId} /> : null}
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 14, border: "1px solid #eee", borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, color: "#667085" }}>Latest Status</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#101828" }}>
              {(lastDrift?.status ?? "unknown").toString()}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
              Risk: <b>{risk.label}</b>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#667085" }}>Estimated 30-day impact</div>
            <div style={{ fontSize: 24, fontWeight: 950, color: "#101828" }}>
              {formatMoney(impact.estimatedImpactCents)}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
              Range: {formatMoney(impact.lowCents)} – {formatMoney(impact.highCents)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#667085" }}>Email</div>
            <div style={{ fontSize: 14, color: "#101828" }}>{business.alert_email ?? "—"}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#667085" }}>
              Paid: {isPaid ? "Yes" : "No"} • TZ: {business.timezone ?? "—"}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={{ margin: "0 0 10px" }}>Recent Alerts</h2>

        {(alerts ?? []).length === 0 ? (
          <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 12, color: "#667085" }}>
            No alerts yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {(alerts ?? []).map((a: any) => (
              <div key={a.id} style={{ padding: 14, border: "1px solid #eee", borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900, color: "#101828" }}>{a.status}</div>
                    <div style={{ fontSize: 12, color: "#667085", marginTop: 4 }}>
                      Window: {a.window_start} → {a.window_end}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#667085" }}>
                    {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                  </div>
                </div>

                {(a.reasons ?? []).length ? (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                    {(a.reasons ?? []).map((r: any, idx: number) => (
                      <li key={idx} style={{ marginBottom: 6 }}>
                        <b>{r.code}</b> — {r.detail}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ marginTop: 10, color: "#667085" }}>No reasons recorded.</div>
                )}

                {a.meta ? (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", color: "#667085" }}>meta</summary>
                    <pre style={{ marginTop: 8, padding: 10, background: "#fafafa", borderRadius: 10, overflowX: "auto" }}>
                      {safeJson(a.meta)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 13, color: "#667085" }}>
        <Link href="/alerts">← Back to alerts list</Link>
      </div>
    </div>
  );
}