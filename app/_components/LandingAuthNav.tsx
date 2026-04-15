"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type SessionState = {
  email: string | null;
  loading: boolean;
};

export default function LandingAuthNav() {
  const [sessionState, setSessionState] = useState<SessionState>({
    email: null,
    loading: true,
  });

  useEffect(() => {
  const supabase = createClient();

  const loadSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    setSessionState({
      email: session?.user?.email ?? null,
      loading: false,
    });
  };

  loadSession();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setSessionState({
      email: session?.user?.email ?? null,
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
      <div className="flex items-center gap-3">
        <div className="h-5 w-24" />
      </div>
    );
  }

  if (sessionState.email) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden text-xs text-white/45 sm:block">
          Signed in as <span className="text-white/65">{sessionState.email}</span>
        </div>

        <Link
          href="/app/alerts"
          className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Command Center
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5 hover:text-white"
        >
          Log Out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/login"
        className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        Command Center Login
      </Link>
    </div>
  );
}