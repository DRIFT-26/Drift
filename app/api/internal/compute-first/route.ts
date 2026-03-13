import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";
import { renderStatusEmail } from "@/lib/email/templates";
import { makeShareToken } from "@/lib/share";

export const runtime = "nodejs";

type EmailStatus =
  | "stable"
  | "movement"
  | "watch"
  | "softening"
  | "attention";

type DriftStatus =
  | "stable"
  | "movement"
  | "watch"
  | "softening"
  | "attention";

type DriftConfidence = "low" | "medium" | "high";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function statusForEmail(status: DriftStatus): EmailStatus {
  return status;
}

function computeRevenueDrift(args: {
  baselineRevenue14d: number;
  currentRevenue14d: number;
  belowBaselineStreak: number;
  latestRevenue: number;
}): {
  status: DriftStatus;
  reasons: string[];
  deltaPct: number;
  confidence: DriftConfidence;
} {
  const {
    baselineRevenue14d,
    currentRevenue14d,
    belowBaselineStreak,
    latestRevenue,
  } = args;

  if (baselineRevenue14d <= 0) {
    return {
      status: "watch",
      reasons: [
        "Monitoring period in progress — DRIFT is collecting baseline history.",
      ],
      deltaPct: 0,
      confidence: "low",
    };
  }

  const deltaPct =
    (currentRevenue14d - baselineRevenue14d) / baselineRevenue14d;

  // SHOCK DETECTION (sudden abnormal day)
  const baselineDailyAvg = baselineRevenue14d / 14;
  const todayRevenue = latestRevenue;
  const todayDelta = (todayRevenue - baselineDailyAvg) / baselineDailyAvg;

  if (todayDelta <= -0.4) {
    return {
      status: "attention",
      reasons: [
        `Today's revenue is down ${Math.abs(todayDelta * 100).toFixed(0)}% vs normal daily performance.`,
        "This appears to be a sudden revenue shock.",
      ],
      deltaPct: todayDelta,
      confidence: "high",
    };
  }

  // ACTION NEEDED
  if (deltaPct <= -0.18) {
    return {
      status: "attention",
      reasons: [
        `Revenue is down ${Math.abs(deltaPct * 100).toFixed(0)}% vs baseline.`,
        belowBaselineStreak >= 4
          ? `Revenue has remained below baseline for ${belowBaselineStreak} consecutive days.`
          : "The deviation is materially outside the expected range.",
      ],
      deltaPct,
      confidence: belowBaselineStreak >= 4 ? "high" : "medium",
    };
  }

  // SOFTENING
  if (deltaPct <= -0.1) {
    return {
      status: "softening",
      reasons: [
        `Revenue is down ${Math.abs(deltaPct * 100).toFixed(0)}% vs baseline.`,
        belowBaselineStreak >= 3
          ? `Revenue has remained below baseline for ${belowBaselineStreak} consecutive days.`
          : "The trend is softening and should be reviewed.",
      ],
      deltaPct,
      confidence: belowBaselineStreak >= 3 ? "high" : "medium",
    };
  }

  // WATCH
  if (deltaPct <= -0.05) {
    return {
      status: "watch",
      reasons: [
        `Revenue is down ${Math.abs(deltaPct * 100).toFixed(0)}% vs baseline.`,
        belowBaselineStreak >= 2
          ? `Revenue has remained below baseline for ${belowBaselineStreak} consecutive days.`
          : "Early movement has been detected relative to baseline.",
      ],
      deltaPct,
      confidence: belowBaselineStreak >= 2 ? "medium" : "low",
    };
  }

  // POSITIVE MOVEMENT
  if (deltaPct >= 0.12) {
    return {
      status: "movement",
      reasons: [
        `Revenue is up ${(deltaPct * 100).toFixed(0)}% vs baseline.`,
        "Revenue momentum is accelerating beyond the expected range.",
      ],
      deltaPct,
      confidence: "medium",
    };
  }

  return {
    status: "stable",
    reasons: ["Revenue is tracking within the expected baseline range."],
    deltaPct,
    confidence: "medium",
  };
}

function dedupeReasons(reasons: string[]) {
  return [...new Set(reasons.filter(Boolean))];
}

function consecutiveDaysBelowBaseline(
  rows: Array<{ snapshot_date: string; metrics: any }>,
  baselineDailyAverage: number
) {
  const dailyTotals = new Map<string, number>();

  for (const row of rows) {
    const date = row.snapshot_date;
    const revenue = Number(row?.metrics?.revenue ?? 0);
    if (!date || Number.isNaN(revenue)) continue;

    dailyTotals.set(date, (dailyTotals.get(date) ?? 0) + revenue);
  }

  const orderedDates = [...dailyTotals.keys()].sort();
  let streak = 0;

  for (let i = orderedDates.length - 1; i >= 0; i--) {
    const date = orderedDates[i];
    const revenue = dailyTotals.get(date) ?? 0;

    if (revenue < baselineDailyAverage) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const body = await req.json().catch(() => null);

    const businessId = body?.business_id as string | undefined;
    if (!businessId) {
      return NextResponse.json(
        { ok: false, error: "business_id required" },
        { status: 400 }
      );
    }

    const { data: biz, error: bErr } = await supabase
      .from("businesses")
      .select("id,name,alert_email")
      .eq("id", businessId)
      .single();

    if (bErr || !biz) {
      return NextResponse.json(
        { ok: false, error: bErr?.message ?? "Business not found" },
        { status: 404 }
      );
    }

    const baselineDays = 60;
    const currentDays = 14;

    const { data: revenueSources, error: sourceErr } = await supabase
      .from("sources")
      .select("id,type,is_connected")
      .eq("business_id", businessId)
      .in("type", ["csv_revenue", "stripe_revenue", "google_sheets_revenue"]);

    if (sourceErr) {
      return NextResponse.json(
        { ok: false, error: sourceErr.message },
        { status: 500 }
      );
    }

    const connectedRevenueSources = (revenueSources ?? []).filter((s) => {
      if (s.type === "csv_revenue") return true;
      return s.is_connected;
    });

    if (!connectedRevenueSources.length) {
      return NextResponse.json(
        { ok: false, error: "No revenue source connected for this business." },
        { status: 400 }
      );
    }

    const revenueSourceIds = connectedRevenueSources.map((s) => s.id);

    const { data: latestSnapshot, error: latestErr } = await supabase
      .from("snapshots")
      .select("snapshot_date")
      .eq("business_id", businessId)
      .in("source_id", revenueSourceIds)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .single();

    if (latestErr || !latestSnapshot?.snapshot_date) {
      return NextResponse.json(
        {
          ok: false,
          error: latestErr?.message ?? "No snapshots found for business",
        },
        { status: 404 }
      );
    }

    const anchorDate = new Date(`${latestSnapshot.snapshot_date}T12:00:00Z`);

    const currentStart = new Date(anchorDate);
    currentStart.setDate(anchorDate.getDate() - currentDays + 1);

    const baselineEnd = new Date(currentStart);
    baselineEnd.setDate(currentStart.getDate() - 1);

    const baselineStart = new Date(baselineEnd);
    baselineStart.setDate(baselineEnd.getDate() - baselineDays + 1);

    const baselineStartStr = isoDate(baselineStart);
    const baselineEndStr = isoDate(baselineEnd);
    const currentStartStr = isoDate(currentStart);
    const anchorDateStr = isoDate(anchorDate);

    const { data: baselineRows, error: baseErr } = await supabase
      .from("snapshots")
      .select("source_id, snapshot_date, metrics")
      .eq("business_id", businessId)
      .in("source_id", revenueSourceIds)
      .gte("snapshot_date", baselineStartStr)
      .lte("snapshot_date", baselineEndStr);

    if (baseErr) {
      return NextResponse.json(
        { ok: false, error: baseErr.message },
        { status: 500 }
      );
    }

    const { data: currentRows, error: curErr } = await supabase
      .from("snapshots")
      .select("source_id, snapshot_date, metrics")
      .eq("business_id", businessId)
      .in("source_id", revenueSourceIds)
      .gte("snapshot_date", currentStartStr)
      .lte("snapshot_date", anchorDateStr);

    if (curErr) {
      return NextResponse.json(
        { ok: false, error: curErr.message },
        { status: 500 }
      );
    }

    const sumRevenue = (rows: any[]) =>
      rows.reduce((acc, row) => {
        const revenue = Number(row?.metrics?.revenue ?? 0);
        return acc + (Number.isNaN(revenue) ? 0 : revenue);
      }, 0);

    const baselineRevenueWindow = sumRevenue(baselineRows ?? []);
    const currentRevenue14d = sumRevenue(currentRows ?? []);

    const baselineRevenue14d =
      baselineDays > 0 ? (baselineRevenueWindow / baselineDays) * currentDays : 0;

    const baselineDailyAverage = baselineRevenue14d / 14;

    const belowBaselineStreak = consecutiveDaysBelowBaseline(
      currentRows ?? [],
      baselineDailyAverage
    );

    const latestRevenue =
      currentRows?.[currentRows.length - 1]?.metrics?.revenue ?? 0;

    const drift = computeRevenueDrift({
      baselineRevenue14d,
      currentRevenue14d,
      belowBaselineStreak,
      latestRevenue,
    });

    const reasons = dedupeReasons(drift.reasons);

    const share_token = makeShareToken();
    const share_expires_at = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 14
    ).toISOString();

    const { data: alert, error: aErr } = await supabase
      .from("alerts")
      .insert({
        business_id: businessId,
        status: drift.status,
        reasons,
        share_token,
        share_expires_at,
        meta: {
          confidence: drift.confidence,
        },
      })
      .select()
      .single();

    if (aErr || !alert) {
      return NextResponse.json(
        { ok: false, error: aErr?.message ?? "Failed to create alert" },
        { status: 500 }
      );
    }

    const shareUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/s/${share_token}`
      : undefined;

    const forceEmail = body?.force_email === true;

    const shouldEmail =
      forceEmail ||
      drift.status === "softening" ||
      drift.status === "attention";

    if (biz.alert_email && shouldEmail) {
      const { subject, text } = renderStatusEmail({
        businessName: biz.name,
        status: statusForEmail(drift.status),
        reasons,
        windowStart: currentStartStr,
        windowEnd: anchorDateStr,
        shareUrl,
      });

      await sendDriftEmail({
        to: biz.alert_email,
        subject,
        text,
      });
    }

    await supabase
      .from("businesses")
      .update({
        needs_compute: false,
        last_computed_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    return NextResponse.json({
      ok: true,
      drift: {
        ...drift,
        reasons,
        baselineRevenue14d,
        currentRevenue14d,
        anchorDate: anchorDateStr,
        baselineWindow: {
          start: baselineStartStr,
          end: baselineEndStr,
        },
        currentWindow: {
          start: currentStartStr,
          end: anchorDateStr,
        },
      },
      shouldEmail,
      alert_id: alert.id,
      share_token,
      share_url: shareUrl ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}