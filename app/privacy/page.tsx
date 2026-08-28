import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | DRIFT",
  description: "Privacy Policy for DRIFT",
};

const updatedAt = "August 27, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0B1220] text-white">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-white/65 hover:text-white">
          Back to DRIFT
        </Link>

        <div className="mt-10">
          <p className="font-mono text-xs uppercase tracking-wide text-white/45">
            Last updated {updatedAt}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/70">
            DRIFT helps business operators monitor revenue movement and receive
            alerts when performance changes materially. This policy explains the
            information we collect, how we use it, and the choices available to
            users.
          </p>
        </div>

        <div className="mt-10 space-y-8 text-sm leading-7 text-white/72">
          <section>
            <h2 className="text-lg font-semibold text-white">
              Information We Collect
            </h2>
            <p className="mt-3">
              We collect account and business information you provide, such as
              business name, work email, timezone, billing status, and connected
              revenue source details. If you connect QuickBooks, Stripe, Google
              Sheets, or another supported source, we collect the authorization
              and revenue data needed to provide DRIFT monitoring.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">
              How We Use Information
            </h2>
            <p className="mt-3">
              We use information to connect revenue sources, ingest revenue data,
              compute drift signals, send alerts and summaries, provide support,
              maintain security, and improve the reliability of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">
              Connected Services
            </h2>
            <p className="mt-3">
              When you authorize a connected service, DRIFT uses that connection
              only to retrieve the data required for monitoring and alerts. You
              may disconnect access through the connected service provider or by
              contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">
              Sharing and Disclosure
            </h2>
            <p className="mt-3">
              We do not sell personal information. We may share limited
              information with service providers that help us operate DRIFT, such
              as hosting, database, payment, email, analytics, and connected-data
              providers. We may also disclose information when required by law or
              to protect DRIFT, users, or the public.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">
              Data Security
            </h2>
            <p className="mt-3">
              We use reasonable administrative, technical, and organizational
              safeguards designed to protect information. No internet service can
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">
              Data Retention
            </h2>
            <p className="mt-3">
              We keep information for as long as needed to provide DRIFT, comply
              with legal obligations, resolve disputes, and enforce agreements.
              Users may request deletion of their account or connected-source
              data, subject to legal and operational requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Contact</h2>
            <p className="mt-3">
              Questions about this policy can be sent to{" "}
              <a
                href="mailto:support@drifthq.co"
                className="text-white underline underline-offset-4"
              >
                support@drifthq.co
              </a>
              .
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
