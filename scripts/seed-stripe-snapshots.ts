import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function midnightUtc(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function main() {
  const businessId = process.env.SEED_BUSINESS_ID!;
  const sourceId = process.env.SEED_SOURCE_ID!;

  if (!businessId || !sourceId) {
    throw new Error("Missing SEED_BUSINESS_ID or SEED_SOURCE_ID");
  }

  // End on yesterday so all rows are completed days
  const today = midnightUtc(new Date());
  const end = addDays(today, -1);
  const start = addDays(end, -73); // 74 total rows

  const rows: Array<{
    business_id: string;
    source_id: string;
    snapshot_date: string;
    metrics: {
      revenue: number;
      revenue_cents: number;
      refunds_cents: number;
      net_revenue_cents: number;
      refund_rate: number;
      charge_count: number;
    };
  }> = [];

  for (let i = 0; i < 74; i++) {
    const day = addDays(start, i);

    // Phase model:
    // Days 1–45: stable baseline
    // Days 46–60: mild softening
    // Days 61–70: stronger decline
    // Days 71–74: sharp drop / high refund pressure

    let grossRevenueCents = 0;
    let refundsCents = 0;
    let chargeCount = 0;

    if (i < 45) {
      grossRevenueCents = 19000 + Math.round((Math.random() - 0.5) * 2500);
      refundsCents = Math.round(grossRevenueCents * (0.015 + Math.random() * 0.015));
      chargeCount = clamp(4 + Math.round((Math.random() - 0.5) * 2), 2, 7);
    } else if (i < 60) {
      grossRevenueCents = 16500 + Math.round((Math.random() - 0.5) * 2200);
      refundsCents = Math.round(grossRevenueCents * (0.025 + Math.random() * 0.02));
      chargeCount = clamp(4 + Math.round((Math.random() - 0.5) * 2), 2, 6);
    } else if (i < 70) {
      grossRevenueCents = 13800 + Math.round((Math.random() - 0.5) * 1800);
      refundsCents = Math.round(grossRevenueCents * (0.04 + Math.random() * 0.025));
      chargeCount = clamp(3 + Math.round((Math.random() - 0.5) * 2), 1, 5);
    } else {
      grossRevenueCents = 10200 + Math.round((Math.random() - 0.5) * 1400);
      refundsCents = Math.round(grossRevenueCents * (0.07 + Math.random() * 0.04));
      chargeCount = clamp(3 + Math.round((Math.random() - 0.5) * 2), 1, 4);
    }

    grossRevenueCents = Math.max(0, grossRevenueCents);
    refundsCents = Math.max(0, Math.min(refundsCents, grossRevenueCents));

    const netRevenueCents = grossRevenueCents - refundsCents;
    const refundRate = grossRevenueCents > 0 ? refundsCents / grossRevenueCents : 0;

    rows.push({
      business_id: businessId,
      source_id: sourceId,
      snapshot_date: isoDate(day),
      metrics: {
        // Critical for current compute-first route
        revenue: netRevenueCents / 100,

        revenue_cents: grossRevenueCents,
        refunds_cents: refundsCents,
        net_revenue_cents: netRevenueCents,
        refund_rate: Number(refundRate.toFixed(4)),
        charge_count: chargeCount,
      },
    });
  }

  const { error } = await supabase
    .from("snapshots")
    .upsert(rows, {
      onConflict: "business_id,source_id,snapshot_date",
    });

  if (error) {
    throw error;
  }

  console.log("Seed complete.");
  console.log({
    businessId,
    sourceId,
    rows: rows.length,
    start: rows[0]?.snapshot_date,
    end: rows[rows.length - 1]?.snapshot_date,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});