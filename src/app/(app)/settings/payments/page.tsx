import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ConnectCard } from "@/components/payments/connect-card";
import { BusinessRole } from "@/generated/prisma/enums";
import { currentMembership } from "@/server/businesses/access";
import { getConnectStatus, feeBasisPoints } from "@/server/payments/connect";
import { paymentsConfigured } from "@/server/payments/stripe";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>;
}) {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const [status, { connected }] = await Promise.all([
    getConnectStatus(user.id, membership.businessId),
    searchParams,
  ]);

  const bps = feeBasisPoints();
  const feePercent = `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Payments"
        description="Where the money from your bookings goes."
      />

      {connected ? (
        <p className="text-muted-foreground text-sm">
          Back from Stripe. Use <strong>Refresh status</strong> if the badge
          below hasn&apos;t caught up yet.
        </p>
      ) : null}

      <ConnectCard
        status={status}
        configured={paymentsConfigured()}
        feePercent={feePercent}
        isOwner={membership.role === BusinessRole.OWNER}
      />
    </div>
  );
}
