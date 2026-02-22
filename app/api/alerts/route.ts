import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("business_id");

    if (!businessId) {
      return NextResponse.json(
        { ok: false, error: "Missing business_id" },
        { status: 400 }
      );
    }

    const { data: business, error: bErr } = await supabase
      .from("businesses")
      .select(
        "id,name,is_paid,alert_email,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents"
      )
      .eq("id", businessId)
      .single();

    if (bErr) {
      return NextResponse.json(
        { ok: false, error: bErr.message },
        { status: 500 }
      );
    }

    const { data: alerts, error: aErr } = await supabase
      .from("alerts")
      .select(
        "id,business_id,status,reasons,window_start,window_end,created_at,meta"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (aErr) {
      return NextResponse.json(
        { ok: false, error: aErr.message },
        { status: 500 }
      );
    }

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