import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function normalizeSourceType(
  source: string
): "stripe_revenue" | "csv_revenue" | "google_sheets_revenue" {
  if (source === "stripe") return "stripe_revenue";
  if (source === "google_sheets") return "google_sheets_revenue";
  return "csv_revenue";
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseAdmin();
    
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const body = await req.json();

    const businessName = String(
      body.company ?? body.business_name ?? body.name ?? ""
    ).trim();

    const email = String(body?.email || "").trim().toLowerCase();
    const timezone = body.timezone ?? null;
    const source = body.source ?? null;
    const ownerId = body.owner_id ?? null;

    if (!businessName) {
      return NextResponse.json(
        { ok: false, error: "Missing business_name" },
        { status: 400 }
      );
    }

    if (!email || !timezone || !source) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: existingTrial, error: trialCheckError } = await supabase
  .from("trial_claims")
  .select("id, email, business_id, claimed_at")
  .eq("email", email)
  .maybeSingle();

if (trialCheckError) {
  return NextResponse.json(
    { ok: false, error: trialCheckError.message },
    { status: 500 }
  );
}

const ownerOrEmail = ownerId ?? user?.id ?? null;

let existingPortfolioBusiness:
  | {
      billing_status: string | null;
      trial_started_at: string | null;
      trial_ends_at: string | null;
    }
  | null = null;

if (ownerOrEmail) {
  const { data } = await supabase
    .from("businesses")
    .select("billing_status,trial_started_at,trial_ends_at")
    .eq("owner_id", ownerOrEmail)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  existingPortfolioBusiness = data;
} else {
  const { data } = await supabase
    .from("businesses")
    .select("billing_status,trial_started_at,trial_ends_at")
    .eq("alert_email", email)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  existingPortfolioBusiness = data;
}

const now = Date.now();

const existingStatus = existingPortfolioBusiness?.billing_status ?? null;
const existingTrialEndsAt = existingPortfolioBusiness?.trial_ends_at ?? null;
const existingTrialStartedAt = existingPortfolioBusiness?.trial_started_at ?? null;

const existingTrialIsActive =
  existingStatus === "trialing" &&
  !!existingTrialEndsAt &&
  new Date(existingTrialEndsAt).getTime() > now;

const existingIsPaidOrInternal =
  existingStatus === "active" || existingStatus === "internal";

const hasUsedTrial = Boolean(existingTrial);

let billingStatus: string;
let trialStartedAt: Date | null = null;
let trialEndsAt: Date | null = null;

if (existingIsPaidOrInternal) {
  billingStatus = existingStatus!;
} else if (existingTrialIsActive) {
  billingStatus = "trialing";
  trialStartedAt = existingTrialStartedAt
    ? new Date(existingTrialStartedAt)
    : null;
  trialEndsAt = existingTrialEndsAt ? new Date(existingTrialEndsAt) : null;
} else if (!hasUsedTrial) {
  billingStatus = "trialing";
  trialStartedAt = new Date();
  trialEndsAt = new Date(now + 30 * 24 * 60 * 60 * 1000);
} else {
  billingStatus = "expired";
}

    const insertPayload: Record<string, unknown> = {
  name: businessName,
  alert_email: email,
  timezone,
  billing_status: billingStatus,
  trial_started_at: trialStartedAt ? trialStartedAt.toISOString() : null,
  trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
  owner_id: user?.id ?? null,
};

    if (ownerId) {
      insertPayload.owner_id = ownerId;
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .insert(insertPayload)
      .select("id")
      .single();

    if (businessError || !business?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: businessError?.message ?? "Failed to create business",
        },
        { status: 500 }
      );
    }

    const normalizedSource = normalizeSourceType(String(source));

    const { data: createdSource, error: sourceError } = await supabase
      .from("sources")
      .insert({
        business_id: business.id,
        type: normalizedSource,
        is_connected: false,
      })
      .select("id")
      .single();

    if (sourceError) {
      return NextResponse.json(
        { ok: false, error: sourceError.message },
        { status: 500 }
      );
    }

    if (!hasUsedTrial) {
      const { error: claimError } = await supabase
        .from("trial_claims")
        .insert({
          email,
          business_id: business.id,
        });

      if (claimError) {
        return NextResponse.json(
          { ok: false, error: claimError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      business_id: business.id,
      source_id: createdSource?.id ?? null,
      source_type: normalizedSource,
      billing_status: billingStatus,
      trial_started_at: trialStartedAt ? trialStartedAt.toISOString() : null,
      trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
      reused_email_without_trial: hasUsedTrial,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}