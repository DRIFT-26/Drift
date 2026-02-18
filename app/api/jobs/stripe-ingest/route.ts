import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Auth for:
 * - Vercel Cron: Authorization: Bearer <CRON_SECRET>
 * - Manual testing: x-cron-secret: <CRON_SECRET>
 *
 * Use ?debug=1 to see safe auth diagnostics on 401.
 */
function requireCronAuth(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();

  const authHeader = (req.headers.get("authorization") || "").trim();
  const m = authHeader.match(/^bearer\s+(.+)$/i);
  const bearerToken = (m?.[1] || "").trim();

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
      hasXCronSecretHeader: Boolean(xToken),
      xCronSecretPrefix: xToken ? xToken.slice(0, 10) : null,
      matched: ok,
    },
  };
}

type StripeConfig = {
  account_id?: string | null; // Stripe Connect (optional)
  currency?: string; // default "usd"
};

function clamp0(n: number) {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

async function sumChargesByDay(stripe: Stripe, params: {
  start: Date;
  end: Date;
  currency: string;
  accountId?: string | null;
}) {
  // Stripe timestamps are seconds
  const startSec = Math.floor(params.start.getTime() / 1000);
  const endSec = Math.floor(addDays(params.end, 1).getTime() / 1000); // exclusive end

  const byDay = new Map<string, { gross_cents: number; refunds_cents: number; charge_count: number; refund_count: number }>();

  // CHARGES (gross)
  let startingAfter: string | undefined = undefined;
  for (;;) {
    const page = await stripe.charges.list(
      {
        limit: 100,
        created: { gte: startSec, lt: endSec },
        ...(params.currency ? { } : {}),
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      params.accountId ? { stripeAccount: params.accountId } : undefined
    );

    for (const ch of page.data) {
      if (!ch.paid || ch.status !== "succeeded") continue;
      if (ch.currency !== params.currency) continue;

      const day = isoDate(new Date(ch.created * 1000));
      const cur = byDay.get(day) || { gross_cents: 0, refunds_cents: 0, charge_count: 0, refund_count: 0 };
      cur.gross_cents += clamp0(ch.amount ?? 0);
      cur.charge_count += 1;
      byDay.set(day, cur);
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  // REFUNDS (separate endpoint)
  startingAfter = undefined;
  for (;;) {
    const page = await stripe.refunds.list(
      {
        limit: 100,
        created: { gte: startSec, lt: endSec },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      params.accountId ? { stripeAccount: params.accountId } : undefined
    );

    for (const rf of page.data) {
      if (rf.currency !== params.currency) continue;
      const day = isoDate(new Date(rf.created * 1000));
      const cur = byDay.get(day) || { gross_cents: 0, refunds_cents: 0, charge_count: 0, refund_count: 0 };
      cur.refunds_cents += clamp0(rf.amount ?? 0);
      cur.refund_count += 1;
      byDay.set(day, cur);
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  // Ensure all days exist with zeros
  for (let d = new Date(params.start); d <= params.end; d = addDays(d, 1)) {
    const key = isoDate(d);
    if (!byDay.has(key)) {
      byDay.set(key, { gross_cents: 0, refunds_cents: 0, charge_count: 0, refund_count: 0 });
    }
  }

  return byDay;
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

  const stripeKey = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!stripeKey) {
    return NextResponse.json({ ok: false, error: "STRIPE_SECRET_KEY missing" }, { status: 500 });
  }

  const supabase = supabaseAdmin();
  const dryRun = url.searchParams.get("dry_run") === "true";
  const days = Math.max(1, Number(url.searchParams.get("days") || 14));

  const end = new Date(); // today
  const start = addDays(end, -(days - 1));
  const startStr = isoDate(start);
  const endStr = isoDate(end);

  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

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

  const startedAt = Date.now();
  const results: any[] = [];

  for (const source of sources ?? []) {
    const cfg = (source.config || {}) as StripeConfig;
    const currency = (cfg.currency || "usd").toLowerCase();
    const accountId = cfg.account_id || null;

    try {
      const byDay = await sumChargesByDay(stripe, { start, end, currency, accountId });

      let snapshotsWritten = 0;

      for (const [day, v] of byDay.entries()) {
        const gross = v.gross_cents;
        const refunds = v.refunds_cents;
        const net = clamp0(gross - refunds);

        const refundRate = gross > 0 ? Math.min(1, refunds / gross) : 0;

        const metrics = {
          revenue_gross_cents: gross,
          revenue_refunds_cents: refunds,
          revenue_net_cents: net,
          charge_count: v.charge_count,
          refund_count: v.refund_count,
          refund_rate: refundRate, // 0..1
          currency,
        };

        if (!dryRun) {
          const { error: upErr } = await supabase
            .from("snapshots")
            .upsert(
              {
                business_id: source.business_id,
                source_id: source.id,
                snapshot_date: day,
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
        ok: true,
        window: { start: startStr, end: endStr, days },
        snapshots_written: snapshotsWritten,
        dry_run: dryRun,
      });
    } catch (e: any) {
      results.push({
        source_id: source.id,
        business_id: source.business_id,
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