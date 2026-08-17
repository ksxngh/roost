import type { Metadata } from "next";

import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms governing use of ${siteConfig.name}.`,
};

const { legal, supportEmail } = siteConfig;

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>
        <strong>{`Effective ${legal.effectiveDate}. `}</strong>
        {`These Terms of Service (the “Terms”) are a binding agreement between you and ${legal.entity} (“Roost,” “we,” “us”) governing your use of the Roost marketplace and business tools (the “Platform”). By creating an account or using the Platform, you agree to these Terms. If you do not agree, do not use the Platform.`}
      </p>

      <h2>1. What Roost is</h2>
      <p>
        Roost is a two-sided marketplace. Homeowners and other customers
        (&ldquo;Customers&rdquo;) discover and book independent home-service
        businesses (&ldquo;Providers&rdquo;), and Providers use our tools to run
        their operations. Roost is a venue and a software provider. We are{" "}
        <strong>not</strong> a party to the service agreement between a Customer
        and a Provider, we do not perform home services, and we do not employ
        Providers.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate information, keep your credentials secure, and
        are responsible for activity under your account. You must be at least 18
        and able to form a binding contract. We may suspend or terminate
        accounts that violate these Terms or that we reasonably believe create
        risk for other users.
      </p>

      <h2>3. Provider obligations</h2>
      <p>As a Provider, you represent and agree that you will:</p>
      <ul>
        <li>
          hold and maintain all licences, permits, and insurance required for
          the services you offer, and provide accurate proof on request;
        </li>
        <li>
          perform services competently, lawfully, and as described on your
          storefront, and honour the prices and availability you publish;
        </li>
        <li>
          be solely responsible for your work, your team, your taxes, and your
          compliance with all applicable laws; and
        </li>
        <li>not misrepresent your identity, qualifications, or affiliation.</li>
      </ul>
      <p>
        Verification by Roost (including any &ldquo;verified&rdquo; badge) is a
        limited administrative check, not a guarantee of a Provider&rsquo;s
        quality, licensing, or fitness. Customers engage Providers at their own
        discretion.
      </p>

      <h2>4. Bookings and payments</h2>
      <p>
        Payments are processed by Stripe, Inc. When you pay through the Platform
        you also agree to Stripe&rsquo;s terms. Providers receive funds through
        their own connected Stripe accounts; Roost charges a platform fee and
        never takes custody of Provider funds. Prices, deposits, refunds, and
        cancellation windows are set by the Provider and shown before you
        confirm. Disputes about the service itself are between the Customer and
        the Provider.
      </p>

      <h2>5. Provider subscriptions</h2>
      <p>
        Providers may subscribe to a paid plan. Subscriptions bill in advance on
        a recurring basis through Stripe and renew automatically until
        cancelled. You may cancel at any time from your billing settings;
        cancellation takes effect at the end of the current billing period, and
        fees already paid are non-refundable except where required by law.
      </p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          use the Platform for any unlawful, fraudulent, or harmful purpose;
        </li>
        <li>
          scrape, probe, overload, or attempt to gain unauthorized access to the
          Platform or other users&rsquo; data;
        </li>
        <li>
          upload malicious files, or content you do not have the right to share;
          or
        </li>
        <li>circumvent fees, or transact off-platform to avoid them.</li>
      </ul>

      <h2>7. Content</h2>
      <p>
        You retain ownership of the content you submit (storefront details,
        photos, reviews, documents). You grant Roost a non-exclusive, worldwide,
        royalty-free licence to host and display that content as needed to
        operate and promote the Platform. You are responsible for the content
        you submit and its accuracy.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The Platform is provided &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo; without warranties of any kind, whether express or
        implied, including merchantability, fitness for a particular purpose,
        and non-infringement. We do not warrant that the Platform will be
        uninterrupted or error-free, or endorse any Provider or Customer.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Roost will not be liable for any
        indirect, incidental, special, consequential, or punitive damages, or
        for the acts, omissions, or services of any Provider or Customer. Our
        total liability arising out of or relating to the Platform will not
        exceed the greater of the amounts you paid to Roost in the twelve months
        before the claim, or CAD $100.
      </p>

      <h2>10. Indemnity</h2>
      <p>
        You agree to indemnify and hold Roost harmless from claims, damages, and
        expenses arising out of your use of the Platform, your content, your
        services, or your breach of these Terms.
      </p>

      <h2>11. Termination</h2>
      <p>
        You may stop using the Platform at any time. We may suspend or terminate
        your access if you breach these Terms or create risk for others.
        Sections that by their nature should survive termination (including
        sections 7&ndash;10) will survive.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update these Terms. If we make material changes, we will update
        the effective date above and, where appropriate, notify you. Your
        continued use after changes take effect constitutes acceptance.
      </p>

      <h2>13. Governing law</h2>
      <p>
        {`These Terms are governed by the laws of ${legal.jurisdiction}, without regard to conflict-of-laws rules. The courts located there have exclusive jurisdiction over disputes arising from these Terms, except where prohibited by applicable law.`}
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
    </>
  );
}
