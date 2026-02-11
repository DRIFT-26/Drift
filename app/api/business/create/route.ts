import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = supabaseAdmin();

  // TEMP for MVP: hardcoded owner_id
  const owner_id = "00000000-0000-0000-0000-000000000000";

  const body = await req.json().catch(() => ({}));
  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : "My Business";

  const { data: business, error: bErr } = await supabase
    .from("businesses")
    .insert({ owner_id, name })
    .select()
    .single();

  if (bErr) {
    return NextResponse.json(
      { ok: false, error: bErr.message },
      { status: 500 }
    );
  }

  const { error: cErr } = await supabase
    .from("baseline_config")
    .insert({
      business_id: business.id,
      baseline_days: 60,
      current_days: 14,
    });

  if (cErr) {
    return NextResponse.json(
      { ok: false, step: "baseline_config", error: cErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, business });
}