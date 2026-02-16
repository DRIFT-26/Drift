import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISODateOnly(v: string): string | null {
  // Accepts "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss..." and returns "YYYY-MM-DD"
  const s = (v || "").trim();
  if (!s) return null;
  const d = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function dateToUtcMidnight(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUtc(date: Date, days: number) {
  const x = new Date(date.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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
  sentiment_column?: string;
  sentiment_scale?: "0_1" | "1_5";
  engagement_column?: string;
  engagement_scale?: "0_1" | "0_100" | "raw";
};

function parseCsvLine(line: string) {
  // V1: simple parsing. Keep CSV clean (no commas inside quoted fields).
  return line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
}

async function fetchCsvRows(csvUrl: string) {
  const res = await fetch(csvUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch_csv_failed: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] as string[][] };

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  return { headers, rows };
}

function idx(headers: string[], name?: string) {
  if (!name) return -1;
  return headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
}

function toNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeSentiment(value: number, scale?: CsvConfig["sentiment_scale"]) {
  if (scale === "1_5") {
    // map 1..5 -> 0..1
    return Math.max(0, Math.min(1, (value - 1) / 4));
  }
  return Math.max(0, Math.min(1, value)); // default 0..1
}

function normalizeEngagement(value: number, scale?: CsvConfig["engagement_scale"]) {
  if (scale === "0_100") return Math.max(0, Math.min(1, value / 100));
  if (scale === "raw") return value;
  return Math.max(0, Math.min(1, value)); // default 0..1
}

type DayAgg = {
  reviewCount: number;
  sentiments: number[];
  engagements: number[];
};

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

  // ✅ days=14 for onboarding backfill, days=2 for nightly resiliency
  const daysParam = Number(url.searchParams.get("days") || "2");
  const days = clampInt(Number.isFinite(daysParam) ? daysParam : 2, 1, 90);

  const businessId = url.searchParams.get("business_id"); // optional
  const sourceId = url.searchParams.get("source_id"); // optional

  const startedAt = Date.now();

  const todayUtc = dateToUtcMidnight(new Date());
  const startUtc = addDaysUtc(todayUtc, -(days - 1));

  const startStr = isoDate(startUtc);
  const endStr = isoDate(todayUtc);

  // Load connected sources
  let q = supabase
    .from("sources")
    .select("id,business_id,type,is_connected,config,display_name")
    .eq("is_connected", true);

  if (businessId) q = q.eq("business_id", businessId);
  if (sourceId) q = q.eq("id", sourceId);

  const { data: sources, error: sErr } = await q;

  if (sErr) {
    return NextResponse.json(
      { ok: false, step: "read_sources", error: sErr.message },
      { status: 500 }
    );
  }

  const results: any[] = [];

  // Precompute all date strings in range
  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) {
    dayKeys.push(isoDate(addDaysUtc(startUtc, i)));
  }

  for (const source of sources ?? []) {
    const type = String(source.type);
    const cfg = (source.config || {}) as CsvConfig;

    try {
      // V1: only CSV ingestion guaranteed
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

      if (type === "csv_engagement" && engagementIdx === -1) {
        results.push({
          source_id: source.id,
          business_id: source.business_id,
          type,
          skipped: true,
          reason: "missing_engagement_column",
        });
        continue;
      }

      // Build per-day aggregation map for the requested window
      const agg: Record<string, DayAgg> = {};
      for (const k of dayKeys) {
        agg[k] = { reviewCount: 0, sentiments: [], engagements: [] };
      }

      for (const r of rows) {
        const d = parseISODateOnly(String(r[dateIdx] || ""));
        if (!d) continue;
        if (d < startStr || d > endStr) continue;

        const bucket = agg[d];
        if (!bucket) continue;

        if (type === "csv_reviews") {
          bucket.reviewCount += 1;

          if (sentimentIdx !== -1) {
            const n = toNumber(r[sentimentIdx]);
            if (typeof n === "number") bucket.sentiments.push(n);
          }
        }

        if (type === "csv_engagement") {
          const n = toNumber(r[engagementIdx]);
          if (typeof n === "number") bucket.engagements.push(n);
        }
      }

      const upserted: Array<{ date: string; metrics: any }> = [];

      for (const day of dayKeys) {
        const bucket = agg[day];

        let metrics: any = {};

        if (type === "csv_reviews") {
          metrics.review_count = bucket.reviewCount;

          if (bucket.sentiments.length) {
            const avg =
              bucket.sentiments.reduce((a, b) => a + b, 0) / bucket.sentiments.length;
            metrics.sentiment_avg = normalizeSentiment(avg, cfg.sentiment_scale);
          } else {
            // keep it null if no sentiment data for that day
            metrics.sentiment_avg = null;
          }
        }

        if (type === "csv_engagement") {
          if (bucket.engagements.length) {
            const avg =
              bucket.engagements.reduce((a, b) => a + b, 0) / bucket.engagements.length;
            metrics.engagement = normalizeEngagement(avg, cfg.engagement_scale);
          } else {
            // explicit 0 keeps charts / compute predictable
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
                snapshot_date: day,
                metrics,
              },
              { onConflict: "business_id,source_id,snapshot_date" }
            );

          if (upErr) throw new Error(`upsert_snapshot_failed(${day}): ${upErr.message}`);
        }

        upserted.push({ date: day, metrics });
      }

      results.push({
        source_id: source.id,
        business_id: source.business_id,
        type,
        ok: true,
        window: { start: startStr, end: endStr, days },
        snapshots_written: upserted.length,
        dry_run: dryRun,
      });
    } catch (e: any) {
      results.push({
        source_id: source.id,
        business_id: source.business_id,
        type,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    window: { start: startStr, end: endStr, days },
    filters: { business_id: businessId ?? null, source_id: sourceId ?? null },
    sources_processed: (sources ?? []).length,
    duration_ms: Date.now() - startedAt,
    results,
  });
}