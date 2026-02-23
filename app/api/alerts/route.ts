// app/api/alerts/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Accept any of these env vars as valid bearer secrets for list mode
function validTokens(): string[] {
  return [
    process.env.DRIFT_CRON_SECRET,
    process.env.DRIFT_ADMIN_TOKEN,
    process.env.DRIFT_LOCAL_API_TOKEN,
  ].filter(Boolean) as string[];
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isListAuthorized(req: Request): boolean {
  const token = getBearerToken(req);
  if (!token) return false;
  return validTokens().includes(token);
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("business_id");

    // ---------
    // LIST MODE (no business_id)
    // ---------
    if (!businessId) {
      const hasAuthHeader = Boolean(req.headers.get("authorization"));
      const authorized = isListAuthorized(req);

      // If the client tried to auth but failed, say Unauthorized (401)
      if (hasAuthHeader && !authorized) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      // If no auth was provided, keep this as a clear 400
      if (!authorized) {
        return NextResponse.json({ ok: false, error: "Missing business_id" }, { status: 400 });
      }

      // Authorized list response
      const { data: businesses, error: bErr } = await supabase
        .from("businesses")
        .select("id,name,is_paid,alert_email,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents")
        .order("created_at", { ascending: false });

      if (bErr) {
        return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        businesses: businesses ?? [],
      });
    }

    // ---------
    // SINGLE BUSINESS MODE
    // ---------
    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("id,name,is_paid,alert_email,timezone,last_drift,last_drift_at,monthly_revenue,monthly_revenue_cents")
      .eq("id", businessId)
      .single();

    if (bizErr) {
      return NextResponse.json({ ok: false, error: bizErr.message }, { status: 500 });
    }

    const { data: alerts, error: aErr } = await supabase
      .from("alerts")
      .select("id,business_id,status,reasons,window_start,window_end,created_at,meta")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (aErr) {
      return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
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