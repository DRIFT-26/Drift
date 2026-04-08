import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");

  if (!businessId) {
    return NextResponse.json({ ok: false, error: "Missing business_id" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("businesses")
    .select("id,last_drift,last_drift_at")
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ready: !!data?.last_drift,
    last_drift_at: data?.last_drift_at ?? null,
  });
}