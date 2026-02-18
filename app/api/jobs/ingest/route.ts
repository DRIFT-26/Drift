// app/api/jobs/ingest/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
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

type CsvConfig = {
  csv_url?: string;
  date_column?: string;

  // Reviews
  sentiment_column?: string;
  sentiment_scale?: "0_1" | "1_5";

  // Engagement
  engagement_column?: string;
  engagement_scale?: "0_1" | "0_100" | "raw";
};

function parseCsvLine(line: string) {
  // V1 simple parsing: keep CSV clean (no commas inside quoted fields)
  return line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
}

async function fetchCsvRows(csvUrl: string) {
  const res = await fetch(csvUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      // Helps with Google Sheets + some CDNs that behave oddly with empty UA
      "user-agent": "drift-ingest/1.0",
      accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) throw new Error(`fetch_csv_failed: ${res.status} ${res.statusText}`);

  const ct = (res.headers.get("content-type") || "").toLowerCase();

  // If Google returns an HTML interstitial/permission page, this catches it with a useful error.
  if (ct.includes("text/html")) {
    const sample = (await res.text()).slice(0, 180);
    throw new Error(
      `fetch_csv_not_csv: content-type=${ct} sample=${JSON.stringify(sample)}`
    );
  }

  const text = await res.text();

  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] as string[][] };

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  return { headers, rows };
}

function idx(headers: string[], name?: string) {
  if (!name) return -1;
  const needle = name.trim().toLowerCase();
  return headers.findIndex((h) => String(h).trim().toLowerCase() === needle);
}

function toNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeSentiment(value: number, scale?: CsvConfig["sentiment_scale"]) {
  if (scale === "1_5") {
    // map 1..5 to 0..1
    return Math.max(0, Math.min(1, (value - 1) / 4));
  }
  // default assume 0..1 already
  return Math.max(0, Math.min(1, value));
}

function normalizeEngagement(value: number, scale?: CsvConfig["engagement_scale"]) {
  if (scale === "0_100") return Math.max(0, Math.min(1, value / 100));
  if (scale === "raw") return value;
  return Math.max(0, Math.min(1, value)); // default 0..1
}

function dateKeyFromCell(raw: string) {
  // Accepts "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ssZ", etc.
  return (raw || "").trim().slice(0, 10);
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

  const supabase = supabaseAdmin();

  const dryRun = url.searchParams.get("dry_run") === "true";

  // Defaults: backfill last 14 days (inclusive window)
  const days = Math.max(1, Number(url.searchParams.get("days") || 14));
  const end = new Date(); // today
  const start = addDays(end, -(days - 1));

  const startStr = isoDate(start);
  const endStr = isoDate(end);

  // Optional filters (for targeted testing)
  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");

  const startedAt = Date.now();

  // Load connected sources
  let q = supabase
    .from("sources")
    .select("id,business_id,type,is_connected,config,display_name")
    .eq("is_connected", true);

  if (filterBusinessId) q = q.eq("business_id", filterBusinessId);
  if (filterSourceId) q = q.eq("id", filterSourceId);

  const { data: sources, error: sErr } = await q;

  if (sErr) {
    return NextResponse.json(
      { ok: false, step: "read_sources", error: sErr.message },
      { status: 500 }
    );
  }

  const results: any[] = [];

  for (const source of sources ?? []) {
    const type = String(source.type);
    const cfg = (source.config || {}) as CsvConfig;

    try {
      // V1: CSV sources only
      if (type !== "csv_reviews" && type !== "csv_engagement") {
        results.push({
          source_id: source.id,
          business_id: source.business_id,
          type,
          skipped: true,
          reason: "not_implemented_v1",
        });
        continue;
      }

      const csvUrl = (cfg.csv_url || "").trim();
      const dateCol = (cfg.date_column || "").trim();

      if (!csvUrl || !dateCol) {
        results.push({
          source_id: source.id,
          business_id: source.business_id,
          type,
          skipped: true,
          reason: "missing_csv_url_or_date_column",
        });
        continue;
      }

      const { headers, rows } = await fetchCsvRows(csvUrl);

      const dateIdx = idx(headers, dateCol);
      if (dateIdx === -1) throw new Error(`csv_missing_column: ${dateCol}`);

      const sentimentIdx = idx(headers, cfg.sentiment_column);
      const engagementIdx = idx(headers, cfg.engagement_column);

      // Build a map of date -> rows for the window
      const wantedDates = new Set<string>();
      for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        wantedDates.add(isoDate(d));
      }

      const byDate = new Map<string, string[][]>();
      for (const r of rows) {
        const d = dateKeyFromCell(r[dateIdx] || "");
        if (!wantedDates.has(d)) continue;
        const bucket = byDate.get(d) || [];
        bucket.push(r);
        byDate.set(d, bucket);
      }

      let snapshotsWritten = 0;

      for (const dayStr of wantedDates) {
        const dayRows = byDate.get(dayStr) || [];
        const metrics: any = {};

        if (type === "csv_reviews") {
          metrics.review_count = dayRows.length;

          if (sentimentIdx !== -1) {
            const sentiments = dayRows
              .map((r) => toNumber(r[sentimentIdx]))
              .filter((n): n is number => typeof n === "number");

            if (sentiments.length) {
              const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
              metrics.sentiment_avg = normalizeSentiment(avg, cfg.sentiment_scale);
            }
          }
        }

        if (type === "csv_engagement") {
          if (engagementIdx === -1) {
            // For engagement sources, column is required
            results.push({
              source_id: source.id,
              business_id: source.business_id,
              type,
              skipped: true,
              reason: "missing_engagement_column",
            });
            // Break out of the per-day loop (this source config is invalid)
            snapshotsWritten = 0;
            break;
          }

          const vals = dayRows
            .map((r) => toNumber(r[engagementIdx]))
            .filter((n): n is number => typeof n === "number");

          if (vals.length) {
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            metrics.engagement = normalizeEngagement(avg, cfg.engagement_scale);
          } else {
            metrics.engagement = 0;
          }
        }

        if (!dryRun) {
          const { error: upErr } = await supabase
            .from("snapshots")
            .upsert(
              {
                business_id: source.business_id,
                source_id: source.id,
                snapshot_date: dayStr,
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
        type,
        ok: true,
        window: { start: startStr, end: endStr, days },
        snapshots_written: snapshotsWritten,
        dry_run: dryRun,
      });
    } catch (e: any) {
      results.push({
        source_id: source.id,
        business_id: source.business_id,
        type: String(source.type),
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