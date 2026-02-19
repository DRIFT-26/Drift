import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import UpgradeButton from "../UpgradeButton";
import SendTestSummaryButton from "./SendTestSummaryButton";
import { projectRisk, estimateRevenueImpact } from "@/lib/drift/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatMoney(cents: number | null | undefined) {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v);
  }
}

export default async function BusinessAlertsPage(props: {
  params: { businessId: string } | Promise<{ businessId: string }>;
}) {
  // ✅ Next 16 safe param resolution
  const resolvedParams = await props.params;
  const businessId = resolvedParams?.businessId;

  if (!businessId) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Alerts</h2>
        <p style={{ color: "#b42318" }}>
          Missing businessId in route params.
        </p>
      </div>
    );
  }

  const supabase = supabaseAdmin();

  // ⚠️ IMPORTANT: your DB column is monthly_revenue (dollars)
  const { data: business, error: bErr } = await supabase
    .from("businesses")
    .select(
      "id,name,is_paid,alert_email,timezone,last_drift,last_drift_at,monthly_revenue"
    )
    .eq("id", businessId)
    .maybeSingle();

  if (bErr) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Alerts</h2>
        <p style={{ color: "#b42318" }}>
          Failed to load business: {bErr.message}
        </p>
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
    .select(
      "id,status,reasons,window_start,window_end,created_at,meta"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (aErr) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Alerts</h2>
        <p style={{ color: "#b42318" }}>
          Failed to load alerts: {aErr.message}
        </p>
      </div>
    );
  }

  const isPaid = business.is_paid === true;
  const lastDrift = business.last_drift ?? null;

  // Convert monthly revenue dollars → cents
  const monthlyRevenueCents =
    typeof business.monthly_revenue === "number"
      ? Math.round(business.monthly_revenue * 100)
      : null;

  const risk = projectRisk(lastDrift);

  const impact = estimateRevenueImpact({
    monthlyRevenueCents,
    drift: lastDrift,
  });

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#667085" }}>
            Alerts
          </div>
          <h1 style={{ margin: 0, fontSize: 28 }}>
            {business.name}
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
            Business ID: <code>{businessId}</code>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <SendTestSummaryButton businessId={businessId} />
          {!isPaid && <UpgradeButton businessId={businessId} />}
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 16,
          border: "1px solid #eee",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "#667085" }}>
          Latest Status
        </div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {lastDrift?.status ?? "unknown"}
        </div>

        <div style={{ marginTop: 8 }}>
          Risk: <strong>{risk.label}</strong>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#667085" }}>
            Estimated 30-Day Impact
          </div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>
            {formatMoney(impact.estimatedImpactCents)}
          </div>
          <div style={{ fontSize: 13, color: "#667085" }}>
            Range: {formatMoney(impact.lowCents)} –{" "}
            {formatMoney(impact.highCents)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Recent Alerts</h2>

        {(alerts ?? []).length === 0 ? (
          <div style={{ color: "#667085" }}>
            No alerts yet.
          </div>
        ) : (
          alerts.map((a: any) => (
            <div
              key={a.id}
              style={{
                marginTop: 14,
                padding: 14,
                border: "1px solid #eee",
                borderRadius: 12,
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {a.status}
              </div>
              <div style={{ fontSize: 12, color: "#667085" }}>
                {a.window_start} → {a.window_end}
              </div>

              {(a.reasons ?? []).length > 0 && (
                <ul style={{ marginTop: 10 }}>
                  {a.reasons.map((r: any, i: number) => (
                    <li key={i}>
                      <strong>{r.code}</strong> — {r.detail}
                    </li>
                  ))}
                </ul>
              )}

              {a.meta && (
                <details style={{ marginTop: 10 }}>
                  <summary>meta</summary>
                  <pre
                    style={{
                      background: "#fafafa",
                      padding: 10,
                      borderRadius: 8,
                      overflowX: "auto",
                    }}
                  >
                    {safeJson(a.meta)}
                  </pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/alerts">← Back to alerts</Link>
      </div>
    </div>
  );
}