// app/alerts/[businessId]/page.tsx
import Link from "next/link";
import { headers } from "next/headers";

type DriftStatus = "stable" | "watch" | "softening" | "attention";

type AlertsApiResponse = {
  ok: boolean;
  error?: string;
  business?: {
    id: string;
    name: string;
    is_paid: boolean;
    alert_email: string | null;
    timezone: string | null;
    last_drift: any | null;
    last_drift_at: string | null;
    monthly_revenue?: number | null; // dollars (legacy field in your DB)
  };
  alerts?: Array<{
    id: string;
    business_id: string;
    status: DriftStatus;
    reasons: Array<{ code: string; detail: string; delta?: number }>;
    window_start: string;
    window_end: string;
    created_at: string;
    meta: any | null;
  }>;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function safeBaseUrl() {
  // Prefer env first (most reliable in prod)
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (envUrl) return envUrl;

  // Fallback to request headers (Next 16 can return Promise)
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "https://drift-app-indol.vercel.app";
  return `${proto}://${host}`;
}

function pill(status: string) {
  const bg =
    status === "stable"
      ? "#ECFDF3"
      : status === "watch"
        ? "#FFFAEB"
        : status === "softening"
          ? "#FEF3F2"
          : "#FEF3F2";
  const fg =
    status === "stable"
      ? "#027A48"
      : status === "watch"
        ? "#B54708"
        : status === "softening"
          ? "#B42318"
          : "#B42318";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      {status}
    </span>
  );
}

export default async function BusinessAlertsPage(props: {
  params: { businessId: string } | Promise<{ businessId: string }>;
}) {
  const { businessId } = await props.params;

  if (!businessId) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Alerts</h1>
        <p style={{ marginTop: 10, color: "#667085" }}>Missing businessId in route params.</p>
      </div>
    );
  }

  if (!isUuid(businessId)) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Alerts</h1>
        <p style={{ marginTop: 10, color: "#667085" }}>
          Invalid businessId (expected UUID): <code>{businessId}</code>
        </p>
      </div>
    );
  }

  const baseUrl = await safeBaseUrl();

  const res = await fetch(`${baseUrl}/api/alerts?business_id=${businessId}`, {
    cache: "no-store",
  });

  const data = (await res.json()) as AlertsApiResponse;

  if (!data.ok || !data.business) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Alerts</h1>
        <p style={{ marginTop: 10, color: "#667085" }}>
          Failed to load business: {data.error ?? "unknown error"}
        </p>
      </div>
    );
  }

  const biz = data.business;
  const latest = biz.last_drift ?? null;
  const latestStatus = (latest?.status ?? null) as DriftStatus | null;
  const engine = latest?.meta?.engine ?? null;
  const direction = latest?.meta?.direction ?? null;
  const score = latest?.meta?.mriScore ?? null;

  const alerts = data.alerts ?? [];

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "#667085", marginBottom: 6 }}>
            <Link href="/alerts" style={{ color: "#667085", textDecoration: "none" }}>
              Alerts
            </Link>{" "}
            / <span style={{ color: "#101828" }}>{biz.name}</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 950, letterSpacing: -0.6, color: "#101828" }}>
            {biz.name}
          </h1>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            {latestStatus ? pill(latestStatus) : null}
            {engine ? (
              <span style={{ fontSize: 12, color: "#667085" }}>
                Engine: <span style={{ color: "#101828", fontWeight: 700 }}>{engine}</span>
              </span>
            ) : null}
            {direction ? (
              <span style={{ fontSize: 12, color: "#667085" }}>
                Direction: <span style={{ color: "#101828", fontWeight: 700 }}>{direction}</span>
              </span>
            ) : null}
            {typeof score === "number" ? (
              <span style={{ fontSize: 12, color: "#667085" }}>
                Score: <span style={{ color: "#101828", fontWeight: 900 }}>{score}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#667085" }}>Business ID</div>
          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: "#101828" }}>
            {biz.id}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 14, border: "1px solid #EAECF0", borderRadius: 14, background: "#fff" }}>
        <div style={{ fontWeight: 900, color: "#101828" }}>Latest Snapshot</div>
        <div style={{ marginTop: 8, fontSize: 13, color: "#667085" }}>
          Last drift at:{" "}
          <span style={{ color: "#101828", fontWeight: 700 }}>{biz.last_drift_at ?? "—"}</span>
        </div>

        {engine === "revenue_v1" && latest?.meta ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 12, border: "1px solid #EAECF0" }}>
              <div style={{ fontSize: 12, color: "#667085" }}>14d Net Revenue</div>
              <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#101828" }}>
                {(latest.meta?.revenue?.currentNetRevenueCents14d ?? 0).toLocaleString()}¢
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#667085" }}>
                Baseline (14d): {(latest.meta?.revenue?.baselineNetRevenueCents14d ?? 0).toLocaleString()}¢
              </div>
            </div>

            <div style={{ padding: 12, borderRadius: 12, border: "1px solid #EAECF0" }}>
              <div style={{ fontSize: 12, color: "#667085" }}>Refund Rate</div>
              <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: "#101828" }}>
                {(((latest.meta?.refunds?.currentRefundRate ?? 0) as number) * 100).toFixed(2)}%
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#667085" }}>
                Baseline: {(((latest.meta?.refunds?.baselineRefundRate ?? 0) as number) * 100).toFixed(2)}%
              </div>
            </div>
          </div>
        ) : null}

        {Array.isArray(latest?.reasons) && latest.reasons.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, color: "#101828", marginBottom: 8 }}>Reasons</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#101828" }}>
              {latest.reasons.map((r: any, i: number) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 800 }}>{r.code}</span> — {r.detail}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 18, padding: 14, border: "1px solid #EAECF0", borderRadius: 14, background: "#fff" }}>
        <div style={{ fontWeight: 900, color: "#101828" }}>Recent Alerts</div>
        <div style={{ marginTop: 10 }}>
          {alerts.length === 0 ? (
            <div style={{ color: "#667085", fontSize: 13 }}>No alerts yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {alerts.map((a) => (
                <div key={a.id} style={{ border: "1px solid #EAECF0", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {pill(a.status)}
                      <span style={{ fontSize: 12, color: "#667085" }}>
                        Window: <span style={{ color: "#101828", fontWeight: 700 }}>{a.window_start}</span> →{" "}
                        <span style={{ color: "#101828", fontWeight: 700 }}>{a.window_end}</span>
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#667085" }}>{new Date(a.created_at).toLocaleString()}</div>
                  </div>

                  {a.reasons?.length ? (
                    <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#101828" }}>
                      {a.reasons.map((r, idx) => (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          <span style={{ fontWeight: 800 }}>{r.code}</span> — {r.detail}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ marginTop: 10, color: "#667085", fontSize: 13 }}>No reasons recorded.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}