import type { BusinessRole } from "@/generated/prisma/enums";
import { siteConfig } from "@/lib/site-config";
import { type Mailer, createMailer } from "@/server/mailer";
import { prisma } from "@/server/db";

const ROLE_LABEL: Record<BusinessRole, string> = {
  OWNER: "an owner",
  ADMIN: "an admin",
  MEMBER: "a team member",
};

/**
 * Email an invitation.
 *
 * The link carries the token, which is the whole authorisation — so this is
 * the only place the token leaves the server, and it goes solely to the
 * invited address.
 */
export async function sendInvitation(
  invitation: {
    businessId: string;
    email: string;
    role: BusinessRole;
    token: string;
  },
  deps: { mailer?: Mailer } = {},
): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: invitation.businessId },
    select: { name: true },
  });
  if (!business) return;

  const acceptUrl = `${siteConfig.url}/invite/${invitation.token}`;
  const send = deps.mailer ?? createMailer();

  await send.send({
    to: invitation.email,
    subject: `You're invited to join ${business.name} on ${siteConfig.name}`,
    text: [
      `${business.name} has invited you to join their team as ${ROLE_LABEL[invitation.role]}.`,
      "",
      `Accept the invitation: ${acceptUrl}`,
      "",
      "You'll be asked to sign in or create an account with this email",
      "address first. The invitation expires in two weeks.",
      "",
      `— ${siteConfig.name}`,
    ].join("\n"),
  });
}
