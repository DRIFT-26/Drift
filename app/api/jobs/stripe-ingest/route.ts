// app/api/jobs/stripe-ingest/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import Stripe from "stripe";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function midnightUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function requireCronAuth(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();

  const authHeader = (req.headers.get("authorization") || "").trim();
  const match = authHeader.match(/^bearer\s+(.+)$/i);
  const bearerToken = (match?.[1] || "").trim();

  const xToken = (req.headers.get("x-cron-secret") || "").trim();

  const token = bearerToken || xToken;
  const ok = Boolean(secret) && token === secret;

  return {
    ok,
    error: ok ? null : secret ? "Unauthorized" : "CRON_SECRET missing",
    debug: {
      hasCronSecretEnv: Boolean(secret),
      hasAuthorizationHeader: Boolean(authHeader),
      authorizationPrefix: authHeader ? authHeader.slice(0, 18) : null,
      bearerTokenPrefix: bearerToken ? bearerToken.slice(0, 10) : null,
      hasXCronSecretHeader: Boolean(xToken),
      xCronSecretPrefix: xToken ? xToken.slice(0, 10) : null,
      matched: ok,
    },
  };
}

type StripeSourceConfig = {
  // Future: Stripe Connect support
  // stripe_account_id?: string;
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function seconds(d: Date) {
  return Math.floor(d.getTime() / 1000);
}

function isSuccessfulCharge(ch: Stripe.Charge) {
  const status = (ch as any).status as string | undefined;
  const succeeded = status ? status === "succeeded" : true;
  return Boolean(ch.paid) && succeeded;
}

async function listChargesInRange(args: { stripe: Stripe; startSec: number; endSec: number }) {
  const { stripe, startSec, endSec } = args;

  const out: Stripe.Charge[] = [];
  let startingAfter: string | undefined = undefined;

  for (;;) {
    const params: Stripe.ChargeListParams = {
      limit: 100,
      created: { gte: startSec, lt: endSec },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    };

    const page: Stripe.ApiList<Stripe.Charge> = await stripe.charges.list(params);

    out.push(...page.data);

    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]!.id;
  }

  return out;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const auth = requireCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, ...(debug ? { debug: auth.debug } : {}) },
      { status: 401 }
    );
  }

  const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, error: "STRIPE_SECRET_KEY missing" }, { status: 500 });
  }

  // ✅ Fix: keep Stripe init compatible with your installed stripe package typings
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const supabase = supabaseAdmin();

  const dryRun = url.searchParams.get("dry_run") === "true";
  const days = Math.max(1, Number(url.searchParams.get("days") || 14));

  // Window: [start..end] where end is today @ 00:00 UTC (so we ingest full past days)
  const end = midnightUtc(new Date());
  const start = addDays(end, -(days - 1));

  const startStr = isoDate(start);
  const endStr = isoDate(end);

  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");

  const startedAt = Date.now();

  let q = supabase
    .from("sources")
    .select("id,business_id,type,is_connected,config,display_name")
    .eq("is_connected", true)
    .eq("type", "stripe_revenue");

  if (filterBusinessId) q = q.eq("business_id", filterBusinessId);
  if (filterSourceId) q = q.eq("id", filterSourceId);

  const { data: sources, error: sErr } = await q;

  if (sErr) {
    return NextResponse.json({ ok: false, step: "read_sources", error: sErr.message }, { status: 500 });
  }

  const results: any[] = [];

  for (const source of sources ?? []) {
    const cfg = (source.config || {}) as StripeSourceConfig;

    try {
      let snapshotsWritten = 0;

      for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        const dayStart = midnightUtc(d);
        const dayEnd = addDays(dayStart, 1);

        const startSec = seconds(dayStart);
        const endSec = seconds(dayEnd);

        const charges = await listChargesInRange({
          stripe,
          startSec,
          endSec,
        });

        const successful = charges.filter(isSuccessfulCharge);

        const revenueCents = successful.reduce((acc, ch) => acc + (ch.amount || 0), 0);
        const refundsCents = successful.reduce((acc, ch) => acc + (ch.amount_refunded || 0), 0);

        const netRevenueCents = revenueCents - refundsCents;
        const refundRate = revenueCents > 0 ? clamp01(refundsCents / revenueCents) : 0;

        const metrics = {
          revenue_cents: revenueCents,
          refunds_cents: refundsCents,
          net_revenue_cents: netRevenueCents,
          refund_rate: refundRate,
          charge_count: successful.length,
        };

        if (!dryRun) {
          const { error: upErr } = await supabase
            .from("snapshots")
            .upsert(
              {
                business_id: source.business_id,
                source_id: source.id,
                snapshot_date: isoDate(dayStart),
                metrics,
              },
              { onConflict: "business_id,source_id,snapshot_date" }
            );

          if (upErr) throw new Error(`upsert_snapshot_failed: ${upErr.message}`);
        }

        snapshotsWritten += 1;
      }

      results.push({
        source_id: source.id,
        business_id: source.business_id,
        type: "stripe_revenue",
        ok: true,
        window: { start: startStr, end: endStr, days },
        snapshots_written: snapshotsWritten,
        dry_run: dryRun,
      });
    } catch (e: any) {
      results.push({
        source_id: source.id,
        business_id: source.business_id,
        type: "stripe_revenue",
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    window: { start: startStr, end: endStr, days },
    filters: { business_id: filterBusinessId ?? null, source_id: filterSourceId ?? null },
    sources_processed: (sources ?? []).length,
    duration_ms: Date.now() - startedAt,
    results,
  });
}