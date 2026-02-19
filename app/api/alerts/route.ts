import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);

    const businessIdRaw = (searchParams.get("business_id") || "").trim();

    if (!businessIdRaw) {
      return NextResponse.json({ ok: false, error: "Missing business_id query param" }, { status: 400 });
    }

    // ✅ Prevent "invalid input syntax for type uuid: 'undefined'"
    if (!isUuid(businessIdRaw)) {
      return NextResponse.json({ ok: false, error: "Invalid business_id (must be UUID)" }, { status: 400 });
    }

    const businessId = businessIdRaw;

    // ✅ Use monthly_revenue_cents (consistent with the rest of the app)
    const { data: business, error: bErr } = await supabase
      .from("businesses")
      .select("id,name,is_paid,alert_email,timezone,last_drift,last_drift_at,monthly_revenue_cents")
      .eq("id", businessId)
      .single();

    if (bErr) {
      return NextResponse.json({ ok: false, step: "read_business", error: bErr.message }, { status: 500 });
    }

    const { data: alerts, error: aErr } = await supabase
      .from("alerts")
      .select("id,business_id,status,reasons,window_start,window_end,created_at,meta")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (aErr) {
      return NextResponse.json({ ok: false, step: "read_alerts", error: aErr.message }, { status: 500 });
    }

    // Helpful convenience for UI: dollars (while storing cents in DB)
    const monthlyRevenueDollars =
      typeof (business as any)?.monthly_revenue_cents === "number"
        ? Math.round(((business as any).monthly_revenue_cents as number) / 100)
        : null;

    return NextResponse.json({
      ok: true,
      business: {
        ...business,
        monthly_revenue: monthlyRevenueDollars, // backwards-friendly for UI
      },
      alerts: alerts ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}