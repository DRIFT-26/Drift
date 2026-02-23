import { NextRequest, NextResponse } from "next/server";

const CRON_SECRET = process.env.DRIFT_CRON_SECRET;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { type, businessId } = body;

  if (!type) {
    return NextResponse.json({ ok: false, error: "Missing type" }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || "";

  try {
    if (type === "stripe") {
      const r = await fetch(`${base}/api/jobs/stripe-ingest?days=14`, {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      return NextResponse.json(await r.json());
    }

    if (type === "daily") {
      const r = await fetch(`${base}/api/jobs/daily`, {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      return NextResponse.json(await r.json());
    }

    return NextResponse.json({ ok: false, error: "Invalid type" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}