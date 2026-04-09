import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ✅ If already logged in → go straight to Command Center
  if (user) {
    redirect("/app/alerts");
  }

  // ✅ Otherwise show landing page
  return (
    <main className="min-h-screen bg-[#070B18] text-white flex flex-col items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          DRIFT
        </h1>

        <p className="mt-4 text-white/65">
          Revenue monitoring for operators.
        </p>

        <div className="mt-8">
          <Link
            href="/login"
            className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-black"
          >
            Command Center Login
          </Link>
        </div>
      </div>
    </main>
  );
}