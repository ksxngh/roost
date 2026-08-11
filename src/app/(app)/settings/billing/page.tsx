import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BillingPanel } from "@/components/billing/billing-panel";
import { PageHeader } from "@/components/page-header";
import { BusinessRole } from "@/generated/prisma/enums";
import { currentMembership } from "@/server/businesses/access";
import { getSubscription } from "@/server/billing/subscription";
import { subscriptionsConfigured } from "@/server/billing/prices";
import { paymentsConfigured } from "@/server/payments/stripe";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingSettingsPage() {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const view = await getSubscription(user.id, membership.businessId);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Billing"
        description="Your Roost subscription and seats."
      />

      <BillingPanel
        isOwner={membership.role === BusinessRole.OWNER}
        // Both keys and prices are needed to actually sell a plan.
        configured={paymentsConfigured() && subscriptionsConfigured()}
        view={{
          plan: view.plan,
          seatLimit: view.seatLimit,
          memberCount: view.memberCount,
          overSeatLimit: view.overSeatLimit,
          subscription: view.subscription
            ? {
                tier: view.subscription.tier,
                status: view.subscription.status,
                currentPeriodEnd:
                  view.subscription.currentPeriodEnd?.toISOString() ?? null,
                cancelAtPeriodEnd: view.subscription.cancelAtPeriodEnd,
              }
            : null,
        }}
      />
    </div>
  );
}
