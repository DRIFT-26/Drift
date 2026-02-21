// app/api/jobs/daily/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeDrift } from "@/lib/drift/compute";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";

export const runtime = "nodejs";

type DriftStatus = "stable" | "softening" | "attention" | "watch";

function json(ok: boolean, body: any, status = 200) {
  return NextResponse.json({ ok, ...body }, { status });
}

function requireAuth(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.CRON_TOKEN || "";
  if (!secret) return { ok: false, error: "Missing CRON_SECRET on server" };

  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token || token !== secret) return { ok: false, error: "Unauthorized" };

  return { ok: true };
}

function isoDate(d: Date) {
  // UTC date only
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function clampDriftStatusForEmail(s: DriftStatus): "stable" | "softening" | "attention" {
  // templates.ts currently only accepts stable|softening|attention
  if (s === "watch") return "softening";
  return s;
}

const toNum = (v: any) => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
};

const sumMetric = (rows: any[], key: string) =>
  rows.reduce((acc, r) => acc + toNum(r?.metrics?.[key]), 0);

const safeRefundRate = (gross: number, refunds: number) => (gross > 0 ? refunds / gross : 0);

async function readBusinessesWithFallback(supabase: ReturnType<typeof supabaseAdmin>, filterBusinessId?: string | null) {
  // Some environments had monthly_revenue_cents; others had monthly_revenue.
  // Selecting a missing column 500s, so we try a "wide" select then fall back.
  const base = "id,name,timezone,alert_email,is_paid";

  const wide = `${base},monthly_revenue_cents,monthly_revenue`;
  let q = supabase.from("businesses").select(wide);
  if (filterBusinessId) q = q.eq("id", filterBusinessId);

  const wideRes = await q;
  if (!wideRes.error) return wideRes;

  // Fallback if schema doesn't have one of those columns
  let q2 = supabase.from("businesses").select(base);
  if (filterBusinessId) q2 = q2.eq("id", filterBusinessId);
  return await q2;
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return json(false, { step: "auth", error: auth.error }, 401);

  const supabase = supabaseAdmin();
  const url = new URL(req.url);

  const dryRun = (url.searchParams.get("dry_run") || "").toLowerCase() === "true";
  const debug = (url.searchParams.get("debug") || "").toLowerCase() === "1";
  const forceEmail = (url.searchParams.get("force_email") || "").toLowerCase() === "true";

  const filterBusinessId = url.searchParams.get("business_id");
  const filterSourceId = url.searchParams.get("source_id");

  const t0 = Date.now();

  // --- Read businesses (schema-safe) ---
  const { data: businesses, error: bErr } = await readBusinessesWithFallback(supabase, filterBusinessId);
  if (bErr) {
    return json(false, { step: "read_businesses", error: bErr.message }, 500);
  }

  const results: any[] = [];

  // Window definitions (UTC, inclusive ends)
  // current: last 14 days incl today
  // prior: 14 days immediately before current
  // baseline: 60 days ending day before current
  const today = new Date();
  const currentEnd = isoDate(today);
  const currentStart = isoDate(addDaysUTC(today, -(14 - 1))); // inclusive 14 days
  const priorEnd = isoDate(addDaysUTC(addDaysUTC(today, -(14 - 1)), -1));
  const priorStart = isoDate(addDaysUTC(addDaysUTC(today, -(14 - 1)), -14));
  const baselineEnd = isoDate(addDaysUTC(addDaysUTC(today, -(14 - 1)), -1));
  const baselineStart = isoDate(addDaysUTC(addDaysUTC(today, -(14 - 1)), -60));

  for (const biz of businesses ?? []) {
    // optional source filter: if provided, only process if that source belongs to biz and is connected
    const { data: sources, error: sErr } = await supabase
      .from("sources")
      .select("id,type,is_connected,config")
      .eq("business_id", biz.id)
      .eq("is_connected", true);

    if (sErr) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: `read_sources_failed:${sErr.message}`,
        dry_run: dryRun,
      });
      continue;
    }

    const connected = sources ?? [];

    // revenue_v1 requires stripe_revenue
    const stripeSource =
      (filterSourceId
        ? connected.find((s: any) => s.id === filterSourceId && s.type === "stripe_revenue")
        : connected.find((s: any) => s.type === "stripe_revenue")) ?? null;

    if (!stripeSource) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: filterSourceId ? "no_matching_stripe_source" : "no_stripe_revenue_source",
        dry_run: dryRun,
        force_email: forceEmail,
        email_to: biz.alert_email ?? null,
        is_paid: (biz as any).is_paid ?? null,
        email_attempted: false,
        email_error: null,
        email_id: null,
        email_debug: null,
      });
      continue;
    }

    // Read last status (from businesses.last_drift if present, else from latest alert)
    let lastStatus: DriftStatus | null = null;
    try {
      // last_drift exists in your schema based on earlier /api/alerts output
      const last = (biz as any)?.last_drift;
      if (last?.status) lastStatus = last.status as DriftStatus;
    } catch {
      // ignore
    }

    // Pull snapshots for baseline+prior+current in one query
    const earliest = baselineStart < priorStart ? baselineStart : priorStart;

    const { data: rows, error: snapErr } = await supabase
      .from("snapshots")
      .select("source_id,metrics,snapshot_date")
      .eq("business_id", biz.id)
      .eq("source_id", stripeSource.id)
      .gte("snapshot_date", earliest)
      .lte("snapshot_date", currentEnd);

    if (snapErr) {
      results.push({
        business_id: biz.id,
        name: biz.name,
        skipped: true,
        reason: `read_snapshots_failed:${snapErr.message}`,
        dry_run: dryRun,
      });
      continue;
    }

    const all = rows ?? [];

    const baselineRows = all.filter((r: any) => r.snapshot_date >= baselineStart && r.snapshot_date <= baselineEnd);
    const priorRows = all.filter((r: any) => r.snapshot_date >= priorStart && r.snapshot_date <= priorEnd);
    const currentRows = all.filter((r: any) => r.snapshot_date >= currentStart && r.snapshot_date <= currentEnd);

    const baselineGross60d = sumMetric(baselineRows, "revenue_cents");
    const baselineRefunds60d = sumMetric(baselineRows, "refunds_cents");
    const baselineNet60dRaw = baselineGross60d - baselineRefunds60d;

    const currentGross14d = sumMetric(currentRows, "revenue_cents");
    const currentRefunds14d = sumMetric(currentRows, "refunds_cents");
    const currentNet14d = currentGross14d - currentRefunds14d;

    const priorGross14d = sumMetric(priorRows, "revenue_cents");
    const priorRefunds14d = sumMetric(priorRows, "refunds_cents");
    const priorNet14d: number | undefined = priorRows.length ? priorGross14d - priorRefunds14d : undefined;

    const computedBaselineRefundRate = safeRefundRate(baselineGross60d, baselineRefunds60d);
    let baselineRefundRate = computedBaselineRefundRate;
    const currentRefundRate = safeRefundRate(currentGross14d, currentRefunds14d);

    // If we don't have baseline history, neutralize baseline comparisons
    const baselineHasHistory = baselineGross60d > 0;
    const baselineNet60d = baselineHasHistory
      ? baselineNet60dRaw
      : Math.round(currentNet14d * (60 / 14)); // makes baseline ~ current so delta isn't nonsense

    if (!baselineHasHistory) {
      baselineRefundRate = currentRefundRate; // makes refund delta = 0
    }

    const drift = computeDrift({
      baselineNetRevenue60d: baselineNet60d,
      currentNetRevenue14d: currentNet14d,
      priorNetRevenue14d: priorNet14d,
      baselineRefundRate,
      currentRefundRate,
    });

    // Add warmup reason (no delta field) if baseline missing
    const driftOut = {
      ...drift,
      reasons: [
        ...(baselineHasHistory ? [] : [{ code: "BASELINE_WARMUP", detail: "Building baseline — need more history for comparisons" }]),
        ...(drift?.reasons ?? []),
      ],
      meta: {
        ...(drift?.meta ?? {}),
        engine: "revenue_v1",
      },
    };

    const status: DriftStatus = (driftOut?.status ?? "stable") as DriftStatus;
    const statusChanged = lastStatus ? lastStatus !== status : true;

    // Persist business last_drift (and optional last_drift_at)
    if (!dryRun) {
      await supabase
        .from("businesses")
        .update({
          last_drift: driftOut,
          last_drift_at: new Date().toISOString(),
        })
        .eq("id", biz.id);
    }

    // Insert alert only if status changed AND not stable
    let alertInserted = false;
    if (!dryRun && statusChanged && status !== "stable") {
      const ins = await supabase.from("alerts").insert({
        business_id: biz.id,
        status,
        reasons: driftOut.reasons ?? [],
        window_start: currentStart,
        window_end: currentEnd,
        meta: driftOut.meta ?? null,
      });
      alertInserted = !ins.error;
    }

    // Email rules: paid + email present + (status changed OR force_email)
    let emailAttempted = false;
    let emailError: string | null = null;
    let emailId: string | null = null;

    if ((biz as any).is_paid && biz.alert_email && (statusChanged || forceEmail)) {
      emailAttempted = true;
      try {
        const { subject, text } = renderStatusEmail({
          businessName: biz.name,
          status: clampDriftStatusForEmail(status),
          reasons: driftOut.reasons ?? [],
          windowStart: currentStart,
          windowEnd: currentEnd,
        });

        const sent = await sendDriftEmail({
          to: biz.alert_email,
          subject,
          text,
        });

        // If your sendDriftEmail returns an id, preserve it; otherwise keep null
        emailId = (sent as any)?.id ?? null;
      } catch (e: any) {
        emailError = e?.message ?? String(e);
      }
    }

    results.push({
      business_id: biz.id,
      name: biz.name,
      drift: driftOut,
      last_status: lastStatus,
      status_changed: statusChanged,
      alert_inserted: alertInserted,
      dry_run: dryRun,
      force_email: forceEmail,
      email_to: biz.alert_email ?? null,
      is_paid: (biz as any).is_paid ?? null,
      email_attempted: emailAttempted,
      email_error: emailError,
      email_id: emailId,
      email_debug: null,
      ...(debug
        ? {
            debug: {
              windows: {
                baseline: { start: baselineStart, end: baselineEnd, days: 60 },
                prior: { start: priorStart, end: priorEnd, days: 14 },
                current: { start: currentStart, end: currentEnd, days: 14 },
              },
              counts: {
                baselineRows: baselineRows.length,
                priorRows: priorRows.length,
                currentRows: currentRows.length,
              },
              sums: {
                baselineGross60d,
                baselineRefunds60d,
                baselineNet60d,
                baselineNet14d: Math.round((baselineNet60d / 60) * 14),
                currentGross14d,
                currentRefunds14d,
                currentNet14d,
                priorNet14d: priorNet14d ?? 0,
              },
              rates: {
                baselineHasHistory,
                computedBaselineRefundRate,
                baselineRefundRate,
                currentRefundRate,
              },
            },
          }
        : {}),
    });
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    businesses_processed: (businesses ?? []).length,
    duration_ms: Date.now() - t0,
    filters: {
      business_id: filterBusinessId ?? null,
      source_id: filterSourceId ?? null,
    },
    results,
  });
}