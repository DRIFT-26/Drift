import Link from "next/link";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
  href="/"
  className="text-sm font-semibold tracking-[0.18em] text-white"
>
  DRIFT
</Link>

          <nav className="flex items-center gap-6 text-sm text-white/60">
            <Link href="/app/alerts" className="transition hover:text-white">
  Command Center Login
</Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}