import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function midnightUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const MODE = process.env.MODE || "stable";

async function main() {
  const businessId = process.env.SEED_BUSINESS_ID!;
  const sourceId = process.env.SEED_SOURCE_ID!;

  const today = midnightUtc(new Date());
  const end = addDays(today, -1);
  const start = addDays(end, -73);

  const rows: any[] = [];

  for (let i = 0; i < 74; i++) {
    const day = addDays(start, i);

    let revenue = 200;

    switch (MODE) {
      case "stable":
        revenue = 200 + Math.random() * 10 - 5;
        break;

      case "movement":
        revenue = 200 + Math.sin(i / 2) * 40;
        break;

      case "softening":
        revenue = 220 - i * 1.2;
        break;

      case "attention":
        revenue = i < 60 ? 220 : 90;
        break;

      case "momentum":
        revenue = 150 + i * 1.8;
        break;
    }

    const revenueCents = Math.round(revenue * 100);
    const refunds = Math.round(revenueCents * (0.02 + Math.random() * 0.02));

    rows.push({
      business_id: businessId,
      source_id: sourceId,
      snapshot_date: isoDate(day),
      metrics: {
        revenue: (revenueCents - refunds) / 100,
        revenue_cents: revenueCents,
        refunds_cents: refunds,
        net_revenue_cents: revenueCents - refunds,
        refund_rate: refunds / revenueCents,
        charge_count: Math.floor(3 + Math.random() * 4),
      },
    });
  }

  const { error } = await supabase
    .from("snapshots")
    .upsert(rows, { onConflict: "business_id,source_id,snapshot_date" });

  if (error) throw error;

  console.log(`Seed complete for MODE=${MODE}`);
}

main();