import Link from "next/link";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/app" className="text-sm font-semibold tracking-wide">
          DRIFT
        </Link>

        <nav className="flex items-center gap-6 text-sm text-white/60">
          <Link href="/app" className="hover:text-white">
            Command Center
          </Link>
          <Link href="/alerts" className="hover:text-white">
            Alerts
          </Link>
        </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}