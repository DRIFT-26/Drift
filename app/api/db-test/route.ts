import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const supabase = supabaseAdmin();

  const { data: inserted, error: insertError } = await supabase
    .from("drift_test")
    .insert({ message: "hello from DRIFT" })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { ok: false, step: "insert", error: insertError.message },
      { status: 500 }
    );
  }

  const { data: rows, error: readError } = await supabase
    .from("drift_test")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (readError) {
    return NextResponse.json(
      { ok: false, step: "read", error: readError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, inserted, rows });
}