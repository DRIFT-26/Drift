import Link from "next/link";

export const metadata = {
  title: "Terms of Service | DRIFT",
  description: "Terms of Service for DRIFT",
};

const updatedAt = "August 27, 2026";

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/70">
            These Terms of Service govern access to and use of DRIFT, a revenue
            monitoring service for business operators. By using DRIFT, you agree
            to these terms.
          </p>
        </div>

        <div className="mt-10 space-y-8 text-sm leading-7 text-white/72">
          <section>
            <h2 className="text-lg font-semibold text-white">Use of DRIFT</h2>
            <p className="mt-3">
              You may use DRIFT only for lawful business purposes and in
              accordance with these terms. You are responsible for the accuracy
              of information you provide and for maintaining appropriate access
              controls for your account and connected services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">
              Connected Services
            </h2>
            <p className="mt-3">
              DRIFT may allow you to connect third-party services such as
              QuickBooks, Stripe, or Google Sheets. You authorize DRIFT to access
              and process data from those services as needed to provide revenue
              monitoring, alerts, and related features.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">
              Monitoring and Alerts
            </h2>
            <p className="mt-3">
              DRIFT provides operational monitoring and informational alerts.
              DRIFT does not provide financial, legal, tax, accounting, or
              investment advice. You remain responsible for business decisions
              made using information from the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Fees</h2>
            <p className="mt-3">
              Paid features, subscriptions, and billing terms are presented at
              signup or checkout. You authorize DRIFT and its payment processors
              to charge applicable fees for selected plans.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">
              Intellectual Property
            </h2>
            <p className="mt-3">
              DRIFT and its software, design, branding, workflows, and content
              are owned by DRIFT or its licensors. These terms do not grant users
              ownership of DRIFT intellectual property.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">
              Disclaimer and Limitation of Liability
            </h2>
            <p className="mt-3">
              DRIFT is provided on an as-is and as-available basis. To the
              maximum extent permitted by law, DRIFT disclaims warranties and is
              not liable for indirect, incidental, special, consequential, or
              punitive damages arising from use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Termination</h2>
            <p className="mt-3">
              You may stop using DRIFT at any time. We may suspend or terminate
              access if use of the service violates these terms, creates risk, or
              is otherwise harmful to DRIFT, users, or third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">Contact</h2>
            <p className="mt-3">
              Questions about these terms can be sent to{" "}
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
