import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");
  const businessIdsParam = searchParams.get("business_ids");

  const ids = businessIdsParam
    ? businessIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : businessId
    ? [businessId]
    : [];

  if (!ids.length) {
    return NextResponse.json(
      { ok: false, error: "Missing business_id or business_ids" },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("businesses")
    .select("id,last_drift,last_drift_at")
    .in("id", ids);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const readyBusinesses = (data ?? []).filter((b) => !!b.last_drift);

  return NextResponse.json({
    ok: true,
    ready: readyBusinesses.length > 0,
    ready_count: readyBusinesses.length,
    ready_business_ids: readyBusinesses.map((b) => b.id),
  });
}