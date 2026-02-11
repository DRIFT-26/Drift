import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendDriftEmail } from "@/lib/email/resend";

// Very small CSV parser (handles commas + quoted values)
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function asIsoDate(s: string): string | null {
  // Accepts YYYY-MM-DD or ISO strings; returns YYYY-MM-DD
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function detectCsvType(headers: string[]) {
  const h = headers.map(x => x.toLowerCase());
  // Reviews: snapshot_date + review_count (and optionally sentiment_avg)
  if (h.includes("review_count") || h.includes("sentiment_avg")) return "csv_reviews";
  // Engagement: snapshot_date + engagement
  if (h.includes("engagement")) return "csv_engagement";
  return "unknown";
}

export async function POST(req: Request) {
  const supabase = supabaseAdmin();

  const form = await req.formData();

  const businessName = String(form.get("business_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const file = form.get("file") as File | null;

  if (!businessName || !email || !file) {
    return NextResponse.json({ ok: false, error: "Missing business_name, email, or file." }, { status: 400 });
  }

  const csvText = await file.text();
  const rows = parseCsv(csvText);

  if (!rows.length) {
    return NextResponse.json({ ok: false, error: "CSV looks empty or invalid." }, { status: 400 });
  }

  const headers = Object.keys(rows[0] ?? {});
  const csvType = detectCsvType(headers);

  if (csvType === "unknown") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "CSV format not recognized. Include columns like: snapshot_date, review_count (optional sentiment_avg) OR snapshot_date, engagement.",
      },
      { status: 400 }
    );
  }

  // 1) Create business
  const { data: business, error: bErr } = await supabase
    .from("businesses")
    .insert({
      owner_id: "00000000-0000-0000-0000-000000000000",
      name: businessName,
      timezone: "America/Chicago",
      alert_email: email,
    })
    .select()
    .single();

  if (bErr) {
    return NextResponse.json({ ok: false, error: `Create business failed: ${bErr.message}` }, { status: 500 });
  }

  // 2) Create source
  const { data: source, error: sErr } = await supabase
    .from("sources")
    .insert({
      business_id: business.id,
      type: csvType,
      is_connected: true,
      meta: { filename: file.name },
    })
    .select()
    .single();

  if (sErr) {
    return NextResponse.json({ ok: false, error: `Create source failed: ${sErr.message}` }, { status: 500 });
  }

  // 3) Insert snapshots from CSV
  // Expected columns:
  // - snapshot_date (required)
  // - review_count (number) + optional sentiment_avg (0..1)
  // OR
  // - engagement (number, typically 0..1)
  const snapshots = rows
    .map(r => {
      const date = asIsoDate(r["snapshot_date"] ?? r["date"] ?? "");
      if (!date) return null;

      const metrics: any = {};
      if (csvType === "csv_reviews") {
        const rc = Number(r["review_count"] ?? r["reviews"] ?? "");
        if (!Number.isNaN(rc)) metrics.review_count = rc;

        const sent = Number(r["sentiment_avg"] ?? r["sentiment"] ?? "");
        if (!Number.isNaN(sent)) metrics.sentiment_avg = sent;
      } else {
        const eng = Number(r["engagement"] ?? "");
        if (!Number.isNaN(eng)) metrics.engagement = eng;
      }

      return {
        business_id: business.id,
        source_id: source.id,
        snapshot_date: date,
        metrics,
      };
    })
    .filter(Boolean) as Array<{ business_id: string; source_id: string; snapshot_date: string; metrics: any }>;

  if (!snapshots.length) {
    return NextResponse.json(
      { ok: false, error: "No valid snapshot rows found. Ensure snapshot_date is present and valid." },
      { status: 400 }
    );
  }

  // Upsert by (source_id, snapshot_date) if you have unique constraint; otherwise insert.
  const { error: snapErr } = await supabase.from("snapshots").insert(snapshots);

  if (snapErr) {
    return NextResponse.json({ ok: false, error: `Insert snapshots failed: ${snapErr.message}` }, { status: 500 });
  }

  // 4) Send onboarding email (simple + trust-building)
  try {
    await sendDriftEmail({
      to: email,
      subject: "DRIFT is now monitoring your business",
      text: `DRIFT is now monitoring ${businessName}.\n\nYou’ll receive:\n• Alerts when momentum shifts\n• A weekly check-in when things are stable\n\n— DRIFT`,
    });
  } catch (e: any) {
    // Non-fatal: onboarding still succeeded
  }

  // Trigger first compute + first status email (best-effort)
try {
  await fetch(new URL("/api/internal/compute-first", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ business_id: business.id }),
  });
} catch {}
  return NextResponse.json({
    ok: true,
    business_id: business.id,
    source_id: source.id,
    csv_type: csvType,
    snapshots_inserted: snapshots.length,
  });
}