import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const secret = (process.env.CRON_SECRET || "").trim();
    const authHeader = (req.headers.get("authorization") || "").trim();
    const xToken = (req.headers.get("x-cron-secret") || "").trim();

    const ok =
      !secret ||
      authHeader === `Bearer ${secret}` ||
      xToken === secret;

    if (!ok) {
      return NextResponse.json(
        { ok: false, error: secret ? "Unauthorized" : "CRON_SECRET missing" },
        { status: 401 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: businesses, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("needs_compute", true)
      .limit(100);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://drifthq.co";
    const results: Array<{ business_id: string; ok: boolean; error?: string }> = [];

    for (const business of businesses ?? []) {
      try {
        const res = await fetch(`${appUrl}/api/internal/compute-first`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            business_id: business.id,
          }),
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          results.push({
            business_id: business.id,
            ok: false,
            error: json?.error ?? "Compute failed",
          });
          continue;
        }

        results.push({
          business_id: business.id,
          ok: true,
        });
      } catch (err) {
        results.push({
          business_id: business.id,
          ok: false,
          error: err instanceof Error ? err.message : "Unexpected error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}