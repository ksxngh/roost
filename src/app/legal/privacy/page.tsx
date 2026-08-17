import type { Metadata } from "next";

import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${siteConfig.name} collects, uses, and protects your data.`,
};

const { legal, supportEmail } = siteConfig;

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        <strong>{`Effective ${legal.effectiveDate}. `}</strong>
        {`This Privacy Policy explains how ${legal.entity} (“Roost”) collects, uses, and shares personal information when you use our marketplace and business tools (the “Platform”). We aim to collect only what we need to run the Platform well.`}
      </p>

      <h2>1. Information we collect</h2>
      <p>We collect:</p>
      <ul>
        <li>
          <strong>Account information</strong> — name, email, and password
          (hashed, never stored in plain text); for Providers, business details,
          service areas, and uploaded licence and insurance documents.
        </li>
        <li>
          <strong>Booking and transaction data</strong> — the services booked,
          schedules, quotes, invoices, and messages needed to fulfil the work.
        </li>
        <li>
          <strong>Payment data</strong> — processed by Stripe. We receive
          limited confirmation details (such as status and the last four digits
          of a card); we do <strong>not</strong> store full card numbers.
        </li>
        <li>
          <strong>Technical data</strong> — IP address, device and browser
          information, and cookies strictly necessary to keep you signed in and
          to secure the Platform.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <p>We use personal information to:</p>
      <ul>
        <li>
          operate the marketplace — connect Customers and Providers, and process
          bookings, quotes, invoices, and payments;
        </li>
        <li>
          verify Provider licensing and insurance, and keep the marketplace
          safe;
        </li>
        <li>
          send transactional messages (booking confirmations, reminders,
          receipts, and account notices);
        </li>
        <li>
          provide support, prevent fraud and abuse, and enforce our Terms; and
        </li>
        <li>comply with legal obligations.</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>3. How we share information</h2>
      <p>We share personal information only as needed:</p>
      <ul>
        <li>
          <strong>Between Customers and Providers</strong> — a booking shares
          the contact and job details each side needs to complete the work.
        </li>
        <li>
          <strong>Service providers (subprocessors)</strong> — such as Stripe
          (payments), our hosting and database providers, and our email
          provider, who process data on our behalf under contract.
        </li>
        <li>
          <strong>Legal and safety</strong> — where required by law or to
          protect rights, safety, and the integrity of the Platform.
        </li>
        <li>
          <strong>Business transfers</strong> — in connection with a merger,
          acquisition, or sale of assets, subject to this Policy.
        </li>
      </ul>

      <h2>4. Cookies</h2>
      <p>
        We use cookies that are strictly necessary to keep you signed in, to
        remember your theme preference, and to protect the Platform (for
        example, rate limiting). We do not use advertising cookies.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We keep personal information for as long as your account is active and
        as needed to provide the Platform, then only as long as required for
        legal, accounting, and dispute-resolution purposes. Verification
        documents are retained while relevant to a Provider&rsquo;s standing and
        deleted or anonymized when no longer needed.
      </p>

      <h2>6. Security</h2>
      <p>
        We use industry-standard safeguards, including encryption in transit,
        hashed passwords, access controls, uploaded-file scanning, and audit
        logging of sensitive actions. No system is perfectly secure, but we work
        to protect your information and to respond promptly to incidents.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct,
        delete, or export your personal information, and to object to or
        restrict certain processing. To exercise these rights, email{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. We will respond
        within the timeframe required by applicable law.
      </p>

      <h2>8. Children</h2>
      <p>
        The Platform is not directed to children under 18, and we do not
        knowingly collect their personal information.
      </p>

      <h2>9. International</h2>
      <p>
        {`We are based in ${legal.jurisdiction} and may process information there and with subprocessors located elsewhere. Where we transfer data across borders, we use appropriate safeguards.`}
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update this Policy. Material changes will be reflected in the
        effective date above and, where appropriate, communicated to you.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions or requests about your privacy? Email{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
    </>
  );
}
