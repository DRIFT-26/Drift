"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type SessionState = {
  email: string | null;
};

export default function LandingAccountActions() {
  const [sessionState, setSessionState] = useState<SessionState>({
    email: null,
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const loadSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!cancelled) {
          setSessionState({
            email: session?.user?.email ?? null,
          });
        }
      } catch {
        if (!cancelled) {
          setSessionState({ email: null });
        }
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setSessionState({
          email: session?.user?.email ?? null,
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (sessionState.email) {
    return (
      <div className="mt-10 text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/app/alerts"
            className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F]"
          >
            Open Command Center
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Log Out
          </button>
        </div>

        <div className="mt-3 text-sm text-white/60">
          Signed in as {sessionState.email}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 text-center">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href="/onboard"
          className="inline-flex items-center justify-center rounded-md bg-[#0A2A66] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#09306F]"
        >
          Start 30 Days of DRIFT
        </a>

        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Command Center Login
        </Link>
      </div>

      <div className="mt-4 text-sm text-white/65">
        30 days of DRIFT watching your revenue. No card required.
      </div>

      <div className="mt-2 text-xs text-white/50">
        Founding members receive locked pricing, direct access to the roadmap,
        and white-glove onboarding while DRIFT is shaped with a small group of
        early operators.
      </div>

      <div className="mt-2 text-xs text-white/40">
        Limited to 10 founding companies.
      </div>
    </div>
  );
}