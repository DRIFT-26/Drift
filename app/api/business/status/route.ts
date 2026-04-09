import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isUuidLike(v: string) {
  return /^[0-9a-fA-F-]{32,36}$/.test(v);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");
  const businessIdsParam = searchParams.get("business_ids");

  const rawIds = businessIdsParam
    ? businessIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : businessId
    ? [businessId]
    : [];

  const ids = rawIds.filter(isUuidLike);

  if (!ids.length) {
    return NextResponse.json({
      ok: true,
      ready: false,
      ready_count: 0,
      ready_business_ids: [],
    });
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