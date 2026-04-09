"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/app/alerts");
      }
    });
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/app/alerts`,
      },
    });

    setLoading(false);

    if (!error) {
      setSent(true);
    }
  }

  return (
    <main className="min-h-screen bg-[#070B18] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8">
        <h1 className="text-2xl font-semibold">Command Center Login</h1>
        <p className="mt-3 text-sm text-white/65">
          Use the same email you used to onboard your business.
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
            Check your inbox for your login link.
          </div>
        ) : (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-md border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-70"
            >
              {loading ? "Sending link..." : "Send Login Link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}