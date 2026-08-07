import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { TeamManager } from "@/components/team/team-manager";
import { BusinessRole } from "@/generated/prisma/enums";
import { currentMembership } from "@/server/businesses/access";
import { getTeam } from "@/server/businesses/team";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Team" };

export default async function TeamSettingsPage() {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const team = await getTeam(user.id, membership.businessId);
  const canManage =
    membership.role === BusinessRole.OWNER ||
    membership.role === BusinessRole.ADMIN;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Team"
        description="Who works here, and what each person can do."
      />

      <TeamManager
        canManage={canManage}
        seatsInUse={team.seatsInUse}
        seatLimit={team.plan.seatLimit}
        members={team.members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          capabilities: member.capabilities,
          isSelf: member.isSelf,
        }))}
        invitations={team.invitations.map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
