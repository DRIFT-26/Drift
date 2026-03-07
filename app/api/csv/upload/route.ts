import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = supabaseAdmin();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const company = formData.get("company") as string | null;
  const email = formData.get("email") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const text = await file.text();
  const rows = text.split("\n").slice(1); // skip header

  // create business if needed
  const { data: business } = await supabase
    .from("businesses")
    .insert({
      name: company ?? "CSV Business",
      alert_email: email ?? null,
    })
    .select()
    .single();

  const businessId = business?.id;

  if (!businessId) {
    return NextResponse.json({ error: "Failed to create business" }, { status: 500 });
  }

  // ingest CSV rows
  for (const row of rows) {
    const [date, revenue] = row.split(",");

    if (!date || !revenue) continue;

    await supabase.from("snapshots").insert({
      business_id: businessId,
      snapshot_date: date.trim(),
      metrics: {
        revenue: Number(revenue),
      },
    });
  }

  // 🔑 trigger first drift computation
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/internal/compute-first`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      business_id: businessId,
    }),
  });

  return NextResponse.json({
    ok: true,
    business_id: businessId,
  });
}