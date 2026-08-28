import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  extractDailyRevenueFromProfitAndLoss,
  extractRevenueFromProfitAndLoss,
  fetchQuickBooksProfitAndLoss,
  getQuickBooksEnv,
  getUsableQuickBooksConfig,
  QUICKBOOKS_SOURCE_TYPE,
  QuickBooksSourceConfig,
} from "@/lib/quickbooks/client";

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
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
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
  };
}

async function handleIngest(req: Request) {
  const url = new URL(req.url);
  const auth = requireCronAuth(req);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: 401 }
    );
  }

  const { clientId, clientSecret } = getQuickBooksEnv();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "QuickBooks client credentials missing" },
      { status: 500 }
    );
  }

  const supabase = supabaseAdmin();
  const dryRun = url.searchParams.get("dry_run") === "true";
  const days = Math.max(1, Number(url.searchParams.get("days") || 14));
  const today = midnightUtc(new Date());
  const end = addDays(today, -1);
  const start = addDays(end, -(days - 1));
  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");
  const startedAt = Date.now();

  let query = supabase
    .from("sources")
    .select("id,business_id,type,is_connected,config,display_name")
    .eq("is_connected", true)
    .eq("type", QUICKBOOKS_SOURCE_TYPE);

  if (filterBusinessId) query = query.eq("business_id", filterBusinessId);
  if (filterSourceId) query = query.eq("id", filterSourceId);

  const { data: sources, error: sourceErr } = await query;

  if (sourceErr) {
    return NextResponse.json(
      { ok: false, step: "read_sources", error: sourceErr.message },
      { status: 500 }
    );
  }

  const results: Array<Record<string, unknown>> = [];

  for (const source of sources ?? []) {
    try {
      const currentConfig = (source.config || {}) as QuickBooksSourceConfig;
      const { config, refreshed } = await getUsableQuickBooksConfig({
        config: currentConfig,
        clientId,
        clientSecret,
      });

      if (!config.access_token || !config.realm_id) {
        throw new Error("quickbooks_source_missing_access_token_or_realm_id");
      }

      if (refreshed && !dryRun) {
        const { error: updateTokenErr } = await supabase
          .from("sources")
          .update({ config })
          .eq("id", source.id);

        if (updateTokenErr) {
          throw new Error(
            `quickbooks_token_update_failed: ${updateTokenErr.message}`
          );
        }
      }

      const report = await fetchQuickBooksProfitAndLoss({
        accessToken: config.access_token,
        realmId: config.realm_id,
        startDate: isoDate(start),
        endDate: isoDate(end),
        summarizeColumnBy: "Days",
      });

      const dailyRevenue = extractDailyRevenueFromProfitAndLoss(report);
      let snapshotsWritten = 0;

      for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        const snapshotDate = isoDate(d);
        const revenue =
          dailyRevenue.get(snapshotDate) ??
          (days === 1 ? extractRevenueFromProfitAndLoss(report) : 0);

        if (!dryRun) {
          const { error: upsertErr } = await supabase
            .from("snapshots")
            .upsert(
              {
                business_id: source.business_id,
                source_id: source.id,
                snapshot_date: snapshotDate,
                metrics: {
                  revenue,
                  source: "quickbooks_profit_and_loss",
                },
              },
              { onConflict: "business_id,source_id,snapshot_date" }
            );

          if (upsertErr) {
            throw new Error(`upsert_snapshot_failed: ${upsertErr.message}`);
          }
        }

        snapshotsWritten += 1;
      }

      if (!dryRun) {
        await supabase
          .from("businesses")
          .update({
            needs_compute: true,
            last_ingested_at: new Date().toISOString(),
          })
          .eq("id", source.business_id);
      }

      results.push({
        source_id: source.id,
        business_id: source.business_id,
        type: QUICKBOOKS_SOURCE_TYPE,
        ok: true,
        refreshed,
        window: {
          start: isoDate(start),
          end: isoDate(end),
          days,
        },
        snapshots_written: snapshotsWritten,
        dry_run: dryRun,
      });
    } catch (error) {
      results.push({
        source_id: source.id,
        business_id: source.business_id,
        type: QUICKBOOKS_SOURCE_TYPE,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    filters: {
      business_id: filterBusinessId ?? null,
      source_id: filterSourceId ?? null,
    },
    sources_processed: (sources ?? []).length,
    duration_ms: Date.now() - startedAt,
    results,
  });
}

export async function GET(req: Request) {
  return handleIngest(req);
}

export async function POST(req: Request) {
  return handleIngest(req);
}
