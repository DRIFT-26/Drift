// app/api/alerts/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

// Used ONLY for list-mode access (portfolio view).
function isListAuthorized(req: Request) {
  const token = getBearer(req);
  const allow =
    token &&
    (token === process.env.DRIFT_CRON_SECRET ||
      token === process.env.DRIFT_LOCAL_API_TOKEN ||
      token === process.env.DRIFT_ADMIN_TOKEN);
  return Boolean(allow);
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("business_id");

    // -----------------------------
    // LIST MODE (secure)
    // -----------------------------
    if (!businessId) {
      if (!isListAuthorized(req)) {
        return NextResponse.json(
          { ok: false, error: "Missing business_id" },
          { status: 400 } // preserve existing behavior unless authorized
        );
      }

      const { data: businesses, error: bErr } = await supabase
        .from("businesses")
        .select(
          "id,name,is_paid,timezone,alert_email,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents"
        )
        .order("last_drift_at", { ascending: false, nullsFirst: false })
        .limit(100);

      if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });

      return NextResponse.json({
        ok: true,
        businesses: businesses ?? [],
      });
    }

    // -----------------------------
    // DETAIL MODE (existing)
    // -----------------------------
    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select(
        "id,name,is_paid,alert_email,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents"
      )
      .eq("id", businessId)
      .single();

    if (bizErr) return NextResponse.json({ ok: false, error: bizErr.message }, { status: 500 });

    const { data: alerts, error: aErr } = await supabase
      .from("alerts")
      .select("id,business_id,status,reasons,window_start,window_end,created_at,meta")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      business,
      alerts: alerts ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}