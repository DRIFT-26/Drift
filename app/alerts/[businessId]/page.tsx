import { notFound } from "next/navigation";

type PageProps = {
  params: { businessId: string };
};

export default async function BusinessAlertsPage({ params }: PageProps) {
  const businessId = params?.businessId;

  if (!businessId) {
    notFound();
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/alerts?business_id=${businessId}`,
    { cache: "no-store" }
  );

  const json = await res.json();

  if (!json.ok) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Alerts</h2>
        <p style={{ color: "red" }}>
          Failed to load business: {json.error}
        </p>
      </div>
    );
  }

  const { business, alerts } = json;

  return (
    <div style={{ padding: 40 }}>
      <h1>{business.name}</h1>
      <p>Status: {business.last_drift?.status ?? "No data yet"}</p>

      <h3 style={{ marginTop: 30 }}>Recent Alerts</h3>

      {alerts.length === 0 && <p>No alerts yet.</p>}

      {alerts.map((a: any) => (
        <div key={a.id} style={{ marginBottom: 20 }}>
          <strong>{a.status}</strong>
          <div>
            Window: {a.window_start} → {a.window_end}
          </div>
        </div>
      ))}
    </div>
  );
}