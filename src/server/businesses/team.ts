import { randomBytes } from "node:crypto";

import { BusinessRole, MemberCapability } from "@/generated/prisma/enums";
import { seatLimit } from "@/lib/plans";
import {
  ForbiddenError,
  NotFoundError,
  requireEditor,
  requireMembership,
  requireOwner,
} from "@/server/businesses/access";
import { normaliseEmail } from "@/server/businesses/clients";
import { prisma } from "@/server/db";

/** Raised when a team is already at its plan's seat limit. */
export class SeatLimitError extends Error {
  constructor(limit: number) {
    super(
      limit === 1
        ? "Your plan includes a single seat. Upgrade to add teammates."
        : `Your plan includes ${limit} seats, and they are all in use.`,
    );
    this.name = "SeatLimitError";
  }
}

/** Raised when the target is already on the team. */
export class AlreadyMemberError extends Error {
  constructor() {
    super("That person is already on your team.");
    this.name = "AlreadyMemberError";
  }
}

/** The window an invitation stays acceptable. */
const INVITE_TTL_DAYS = 14;

/**
 * Invitation token.
 *
 * Whoever holds the token can join the business, so it must be long and
 * unguessable — a 32-byte CSPRNG value, URL-safe, not the short human-readable
 * reference used for bookings.
 */
function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Everyone who occupies a seat: current members plus outstanding invitations.
 *
 * Pending invites count. Otherwise a business could send eight invitations on
 * a one-seat plan and only discover the problem when the ninth person tries
 * to accept and finds no room.
 */
async function seatsInUse(businessId: string): Promise<number> {
  const [members, invites] = await Promise.all([
    prisma.businessMember.count({ where: { businessId } }),
    prisma.invitation.count({
      where: { businessId, acceptedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  return members + invites;
}

export type TeamView = {
  plan: { tier: string; seatLimit: number };
  seatsInUse: number;
  members: {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: BusinessRole;
    capabilities: MemberCapability[];
    isSelf: boolean;
  }[];
  invitations: {
    id: string;
    email: string;
    role: BusinessRole;
    capabilities: MemberCapability[];
    expiresAt: Date;
  }[];
};

/** The team page: members, pending invites, and how many seats remain. */
export async function getTeam(
  userId: string,
  businessId: string,
): Promise<TeamView> {
  await requireMembership(userId, businessId);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      plan: true,
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          role: true,
          capabilities: true,
          user: { select: { name: true, email: true } },
        },
      },
      invitations: {
        where: { acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          email: true,
          role: true,
          capabilities: true,
          expiresAt: true,
        },
      },
    },
  });
  if (!business) throw new NotFoundError();

  return {
    plan: { tier: business.plan, seatLimit: seatLimit(business.plan) },
    seatsInUse: business.members.length + business.invitations.length,
    members: business.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      capabilities: member.capabilities,
      isSelf: member.userId === userId,
    })),
    invitations: business.invitations,
  };
}

/**
 * A member's rank must be high enough to manage another at a given rank.
 *
 * OWNER manages everyone. ADMIN manages only MEMBERs — an admin cannot touch
 * the owner or other admins, and cannot mint new admins. This is what stops
 * an admin from quietly promoting themselves or removing the owner.
 */
function assertCanManageRole(
  actor: BusinessRole,
  targetRole: BusinessRole,
  action: string,
): void {
  if (actor === BusinessRole.OWNER) return;
  if (actor === BusinessRole.ADMIN && targetRole === BusinessRole.MEMBER) {
    return;
  }
  throw new ForbiddenError(action);
}

export type InviteInput = {
  email: string;
  role: BusinessRole;
  capabilities: MemberCapability[];
};

/**
 * Invite someone to the team.
 *
 * Returns the created invitation and its accept URL path. The token is only
 * ever returned here and mailed — it is never listed back, so a leaked team
 * page cannot hand out working tokens.
 */
export async function inviteMember(
  userId: string,
  businessId: string,
  input: InviteInput,
): Promise<{ token: string; email: string; role: BusinessRole }> {
  const actor = await requireEditor(userId, businessId, "invite teammates");
  assertCanManageRole(actor.role, input.role, "invite someone at that role");

  const email = normaliseEmail(input.email);
  if (!email) throw new NotFoundError("email");

  // A capability grant on an ADMIN or OWNER is meaningless (they have all of
  // them) and misleading if stored, so it is dropped.
  const capabilities =
    input.role === BusinessRole.MEMBER ? input.capabilities : [];

  // Already a member? Nothing to invite.
  const existing = await prisma.businessMember.findFirst({
    where: { businessId, user: { email } },
    select: { id: true },
  });
  if (existing) throw new AlreadyMemberError();

  // Re-inviting an address refreshes its invitation rather than adding a
  // second, so this counts the *other* outstanding invites plus the members.
  const priorInvite = await prisma.invitation.findUnique({
    where: { businessId_email: { businessId, email } },
    select: { id: true },
  });
  if (!priorInvite) {
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { plan: true },
    });
    const limit = seatLimit(business.plan);
    if ((await seatsInUse(businessId)) >= limit) {
      throw new SeatLimitError(limit);
    }
  }

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3_600_000);

  await prisma.invitation.upsert({
    where: { businessId_email: { businessId, email } },
    create: {
      businessId,
      email,
      role: input.role,
      capabilities,
      token,
      invitedById: null,
      expiresAt,
    },
    update: {
      role: input.role,
      capabilities,
      token,
      expiresAt,
      acceptedAt: null,
    },
  });

  return { token, email, role: input.role };
}

export async function revokeInvitation(
  userId: string,
  businessId: string,
  invitationId: string,
): Promise<void> {
  await requireEditor(userId, businessId, "revoke an invitation");
  // Scoped by businessId, so another business's invite reads as missing.
  await prisma.invitation.deleteMany({
    where: { id: invitationId, businessId },
  });
}

/** The invitation behind a token, for the accept page. Public by token. */
export async function getInvitationByToken(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      business: { select: { name: true } },
    },
  });
  if (!invitation) return null;
  return {
    ...invitation,
    expired: invitation.expiresAt.getTime() < Date.now(),
  };
}

export class InvitationInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationInvalidError";
  }
}

/**
 * Accept an invitation and take a seat.
 *
 * The accepting user's email must match the invited address — a token grants
 * that specific person entry, not anyone who happens to hold the link. The
 * seat check runs again inside the transaction, so a team that filled up
 * between invite and accept cannot overflow.
 */
export async function acceptInvitation(
  userId: string,
  token: string,
): Promise<{ businessId: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) throw new NotFoundError("account");

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({
      where: { token },
      select: {
        id: true,
        businessId: true,
        email: true,
        role: true,
        capabilities: true,
        expiresAt: true,
        acceptedAt: true,
      },
    });
    if (!invitation) {
      throw new InvitationInvalidError("This invitation is no longer valid.");
    }
    if (invitation.acceptedAt) {
      throw new InvitationInvalidError("This invitation was already used.");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new InvitationInvalidError("This invitation has expired.");
    }
    if (normaliseEmail(user.email) !== invitation.email) {
      throw new InvitationInvalidError(
        "This invitation was sent to a different email address.",
      );
    }

    // Already a member (accepted twice, or invited after joining): treat as
    // done rather than erroring.
    const already = await tx.businessMember.findUnique({
      where: {
        businessId_userId: { businessId: invitation.businessId, userId },
      },
      select: { id: true },
    });
    if (already) {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return { businessId: invitation.businessId };
    }

    const business = await tx.business.findUniqueOrThrow({
      where: { id: invitation.businessId },
      select: { plan: true, _count: { select: { members: true } } },
    });
    if (business._count.members >= seatLimit(business.plan)) {
      throw new SeatLimitError(seatLimit(business.plan));
    }

    await tx.businessMember.create({
      data: {
        businessId: invitation.businessId,
        userId,
        role: invitation.role,
        capabilities:
          invitation.role === BusinessRole.MEMBER
            ? invitation.capabilities
            : [],
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    return { businessId: invitation.businessId };
  });
}

/** Change a member's role and/or granted capabilities. */
export async function updateMember(
  userId: string,
  businessId: string,
  memberId: string,
  changes: { role?: BusinessRole; capabilities?: MemberCapability[] },
): Promise<void> {
  const actor = await requireEditor(userId, businessId, "change a teammate");

  const target = await prisma.businessMember.findFirst({
    where: { id: memberId, businessId },
    select: { id: true, userId: true, role: true },
  });
  if (!target) throw new NotFoundError("teammate");

  // The owner is untouchable by the team-management surface — ownership is
  // transferred, not edited, and that flow is not part of this milestone.
  if (target.role === BusinessRole.OWNER) {
    throw new ForbiddenError("change the owner");
  }
  // You may not edit your own role, so an admin cannot promote themselves.
  if (target.userId === userId) {
    throw new ForbiddenError("change your own role");
  }
  // Managing the target requires rank over their *current* role, and moving
  // them requires rank over their *new* one.
  assertCanManageRole(actor.role, target.role, "change that teammate");
  if (changes.role) {
    assertCanManageRole(actor.role, changes.role, "assign that role");
  }

  const nextRole = changes.role ?? target.role;
  await prisma.businessMember.update({
    where: { id: target.id },
    data: {
      ...(changes.role ? { role: changes.role } : {}),
      // Capabilities only mean anything for a MEMBER; a promotion to ADMIN
      // clears them so a later demotion does not silently restore old grants.
      ...(changes.capabilities !== undefined || changes.role
        ? {
            capabilities:
              nextRole === BusinessRole.MEMBER
                ? (changes.capabilities ?? [])
                : [],
          }
        : {}),
    },
  });
}

/**
 * Remove a member from the team.
 *
 * Their assigned jobs fall back to unassigned rather than vanishing
 * (`onDelete: SetNull` on the assignment relation), and their authored
 * records keep standing. The owner can never be removed this way.
 */
export async function removeMember(
  userId: string,
  businessId: string,
  memberId: string,
): Promise<void> {
  const actor = await requireEditor(userId, businessId, "remove a teammate");

  const target = await prisma.businessMember.findFirst({
    where: { id: memberId, businessId },
    select: { id: true, userId: true, role: true },
  });
  if (!target) throw new NotFoundError("teammate");
  if (target.role === BusinessRole.OWNER) {
    throw new ForbiddenError("remove the owner");
  }
  if (target.userId === userId) {
    throw new ForbiddenError("remove yourself");
  }
  assertCanManageRole(actor.role, target.role, "remove that teammate");

  await prisma.businessMember.delete({ where: { id: target.id } });
}

/** Transfer ownership. Owner-only; the old owner stays as an admin. */
export async function transferOwnership(
  userId: string,
  businessId: string,
  toMemberId: string,
): Promise<void> {
  await requireOwner(userId, businessId, "transfer ownership");

  const target = await prisma.businessMember.findFirst({
    where: { id: toMemberId, businessId },
    select: { id: true, userId: true },
  });
  if (!target) throw new NotFoundError("teammate");
  if (target.userId === userId) return; // Already the owner.

  const current = await prisma.businessMember.findUniqueOrThrow({
    where: { businessId_userId: { businessId, userId } },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.businessMember.update({
      where: { id: current.id },
      data: { role: BusinessRole.ADMIN, capabilities: [] },
    }),
    prisma.businessMember.update({
      where: { id: target.id },
      data: { role: BusinessRole.OWNER, capabilities: [] },
    }),
  ]);
}
