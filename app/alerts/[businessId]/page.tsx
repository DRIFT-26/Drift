// app/alerts/[businessId]/page.tsx
import { supabaseAdmin } from "@/lib/supabase/server";
import UpgradeButton from "../UpgradeButton";
import SendTestSummaryButton from "./SendTestSummaryButton";
import { projectRisk, estimateRevenueImpact } from "@/lib/drift/compute";

export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function formatMoney(cents: number) {
  const n = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n / 100);
}

function fmtPct(x: any) {
  const n = typeof x === "number" && Number.isFinite(x) ? x : 0;
  return `${(n * 100).toFixed(1)}%`;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "good" | "warn" | "bad" | "neutral" }) {
  const bg =
    tone === "good"
      ? "#ECFDF3"
      : tone === "warn"
        ? "#FFFAEB"
        : tone === "bad"
          ? "#FEF3F2"
          : "#F2F4F7";
  const fg =
    tone === "good"
      ? "#027A48"
      : tone === "warn"
        ? "#B54708"
        : tone === "bad"
          ? "#B42318"
          : "#344054";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

function statusTone(status: string | null | undefined): "good" | "warn" | "bad" | "neutral" {
  if (!status) return "neutral";
  if (status === "stable") return "good";
  if (status === "watch" || status === "softening") return "warn";
  if (status === "attention" || status === "drift") return "bad";
  return "neutral";
}

function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.3, color: "#101828" }}>{children}</div>;
}

export default async function BusinessAlertsPage({ params }: { params: { businessId: string } }) {
  const businessId = params?.businessId;

  if (!businessId || !isUuid(businessId)) {
    return (
      <div style={{ padding: 24 }}>
        <Title>Alerts</Title>
        <div style={{ marginTop: 10, color: "#667085" }}>
          Failed to load business: invalid input syntax for type uuid: "{String(businessId)}"
        </div>
      </div>
    );
  }

  const supabase = supabaseAdmin();

  const { data: business, error: bizErr } = await supabase
    .from("businesses")
    // NOTE: select both monthly_revenue and monthly_revenue_cents for compatibility across pivots.
    .select("id,name,is_paid,alert_email,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents")
    .eq("id", businessId)
    .single();

  if (bizErr || !business) {
    return (
      <div style={{ padding: 24 }}>
        <Title>Alerts</Title>
        <div style={{ marginTop: 10, color: "#667085" }}>Failed to load business: {bizErr?.message || "Unknown error"}</div>
      </div>
    );
  }

  const { data: alerts, error: alertsErr } = await supabase
    .from("alerts")
    .select("id,status,reasons,window_start,window_end,created_at,meta")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  const drift = (business as any).last_drift ?? null;
  const driftMeta = drift?.meta ?? null;

  // Normalize monthly revenue cents (some older builds stored `monthly_revenue`)
  const monthlyRevenueCents =
    (business as any).monthly_revenue_cents ??
    (typeof (business as any).monthly_revenue === "number" ? Math.round((business as any).monthly_revenue) : null);

  const risk = projectRisk(drift);
  const impact = estimateRevenueImpact({ monthlyRevenueCents, drift });

  const name = (business as any).name ?? businessId;
  const isPaid = (business as any).is_paid === true;

  const currentStatus = drift?.status ?? null;
  const engine = driftMeta?.engine ?? null;
  const direction = driftMeta?.direction ?? null;
  const mriScore = typeof driftMeta?.mriScore === "number" ? driftMeta.mriScore : null;

  const revenueMeta = driftMeta?.revenue ?? null;
  const refundsMeta = driftMeta?.refunds ?? null;

  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <Title>{name}</Title>
          <div style={{ marginTop: 6, color: "#667085", fontSize: 13 }}>
            Business ID: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{businessId}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SendTestSummaryButton businessId={businessId} />
          {!isPaid ? <UpgradeButton businessId={businessId} /> : null}
        </div>
      </div>

      {/* Current Summary */}
      <div
        style={{
          marginTop: 18,
          padding: 16,
          border: "1px solid #EAECF0",
          borderRadius: 14,
          background: "#FFFFFF",
          boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone={statusTone(currentStatus)}>{currentStatus ? String(currentStatus).toUpperCase() : "NO STATUS"}</Badge>
            {engine ? <Badge tone="neutral">ENGINE: {String(engine).toUpperCase()}</Badge> : null}
            {direction ? <Badge tone="neutral">DIRECTION: {String(direction).toUpperCase()}</Badge> : null}
          </div>

          {mriScore !== null ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>RMI Score</div>
              <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.6, color: "#101828" }}>{mriScore}</div>
            </div>
          ) : null}
        </div>

        {/* Executive outputs (Revenue v1) */}
        {(engine === "revenue_v1" || revenueMeta || refundsMeta) && (
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
            <div style={{ gridColumn: "span 12", color: "#667085", fontSize: 12, fontWeight: 800 }}>
              Revenue Momentum Intelligence (v1)
            </div>

            <div style={{ gridColumn: "span 12", border: "1px solid #EAECF0", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900, color: "#101828" }}>Revenue Velocity (14d vs baseline)</div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10, color: "#344054", fontSize: 13 }}>
                <span>
                  Baseline (14d equiv):{" "}
                  <b>{formatMoney(Number(revenueMeta?.baselineNetRevenueCents14d ?? 0))}</b>
                </span>
                <span>
                  Current (14d): <b>{formatMoney(Number(revenueMeta?.currentNetRevenueCents14d ?? 0))}</b>
                </span>
                <span>
                  Delta:{" "}
                  <b>
                    {typeof revenueMeta?.deltaPct === "number" ? `${(revenueMeta.deltaPct * 100).toFixed(1)}%` : "—"}
                  </b>
                </span>
              </div>
            </div>

            <div style={{ gridColumn: "span 12", border: "1px solid #EAECF0", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900, color: "#101828" }}>Refund Rate Trend</div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10, color: "#344054", fontSize: 13 }}>
                <span>
                  Baseline: <b>{fmtPct(refundsMeta?.baselineRefundRate)}</b>
                </span>
                <span>
                  Current: <b>{fmtPct(refundsMeta?.currentRefundRate)}</b>
                </span>
                <span>
                  Delta: <b>{typeof refundsMeta?.delta === "number" ? `${(refundsMeta.delta * 100).toFixed(1)}%` : "—"}</b>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Reasons */}
        {Array.isArray(drift?.reasons) && drift.reasons.length ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, color: "#101828" }}>Drivers</div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#101828" }}>
              {drift.reasons.slice(0, 5).map((r: any, i: number) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 800 }}>{r?.detail ?? r?.code ?? "Signal"}</span>
                  {typeof r?.delta === "number" ? (
                    <span style={{ color: "#667085" }}> · {r.delta}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div style={{ marginTop: 12, color: "#667085", fontSize: 13 }}>No current drivers.</div>
        )}
      </div>

      {/* Risk + Impact */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
        <div style={{ gridColumn: "span 6", border: "1px solid #EAECF0", borderRadius: 14, padding: 14, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 950, color: "#101828" }}>Risk Label</div>
            <Badge tone={risk?.label === "High" ? "bad" : risk?.label === "Moderate" ? "warn" : "good"}>
              {risk?.label ?? "Low"}
            </Badge>
          </div>

          {Array.isArray((risk as any)?.bullets) && (risk as any).bullets.length ? (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#101828" }}>
              {(risk as any).bullets.map((p: string, i: number) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ marginTop: 10, color: "#667085", fontSize: 13 }}>
              {engine === "revenue_v1" ? "Revenue signals look stable." : "No additional risk notes."}
            </div>
          )}
        </div>

        <div style={{ gridColumn: "span 6", border: "1px solid #EAECF0", borderRadius: 14, padding: 14, background: "#fff" }}>
          <div style={{ fontWeight: 950, color: "#101828" }}>Estimated Revenue Impact</div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: -0.4, color: "#101828" }}>
              {formatMoney(Number((impact as any).estimatedImpactCents ?? 0))}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#667085" }}>
              Range: {formatMoney(Number(impact.lowCents ?? 0))} – {formatMoney(Number(impact.highCents ?? 0))} (next 30 days)
            </div>
            {!monthlyRevenueCents ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "#98A2B3" }}>
                Tip: set monthly revenue to unlock better impact estimates.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <Title>Alerts</Title>
          <div style={{ fontSize: 12, color: "#667085" }}>
            {alertsErr ? `Failed to load alerts: ${alertsErr.message}` : `${(alerts ?? []).length} alerts`}
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {(alerts ?? []).map((a: any) => (
            <div key={a.id} style={{ border: "1px solid #EAECF0", borderRadius: 14, padding: 14, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge tone={statusTone(a.status)}>{String(a.status ?? "unknown").toUpperCase()}</Badge>
                  <div style={{ fontSize: 12, color: "#667085" }}>
                    Window: {a.window_start} → {a.window_end}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#667085" }}>
                  {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                </div>
              </div>

              {Array.isArray(a.reasons) && a.reasons.length ? (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#101828" }}>
                  {a.reasons.slice(0, 6).map((r: any, i: number) => (
                    <li key={i} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 800 }}>{r?.detail ?? r?.code ?? "Signal"}</span>
                      {typeof r?.delta === "number" ? <span style={{ color: "#667085" }}> · {r.delta}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ marginTop: 10, fontSize: 13, color: "#667085" }}>No reasons attached.</div>
              )}
            </div>
          ))}

          {!alertsErr && (!alerts || alerts.length === 0) ? (
            <div style={{ padding: 14, border: "1px dashed #EAECF0", borderRadius: 14, color: "#667085" }}>
              No alerts yet. Once DRIFT detects drift or status changes, they’ll appear here.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}