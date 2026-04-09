"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type SessionState = {
  email: string | null;
  loading: boolean;
};

export default function LandingAccountActions() {
  const [sessionState, setSessionState] = useState<SessionState>({
    email: null,
    loading: true,
  });

  useEffect(() => {
    const supabase = createClient();

    const loadSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setSessionState({
        email: user?.email ?? null,
        loading: false,
      });
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setSessionState({
        email: user?.email ?? null,
        loading: false,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (sessionState.loading) {
    return (
      <div className="mt-10 text-center">
        <div className="text-sm text-white/45">Checking session…</div>
      </div>
    );
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
          Join the Founding Cohort
        </a>

        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Command Center Login
        </Link>
      </div>

      <div className="mt-3 text-sm text-white/60">Takes ~30 seconds</div>
      <div className="mt-1 text-xs text-white/45">
        Founding Cohort — Limited to 10 Companies
      </div>
    </div>
  );
}