import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = supabaseAdmin();

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get("business_id");

  if (!business_id) {
    return NextResponse.json(
      { ok: false, error: "Missing business_id query param" },
      { status: 400 }
    );
  }

  // 1) Fetch business (for paid gating + display)
  const { data: business, error: bErr } = await supabase
    .from("businesses")
    .select("id,name,is_paid,alert_email,timezone")
    .eq("id", business_id)
    .single();

  if (bErr) {
    return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });
  }

  // 2) Fetch alerts
  const { data: alerts, error: aErr } = await supabase
    .from("alerts")
    .select("*")
    .eq("business_id", business_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (aErr) {
    return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, business, alerts });
}