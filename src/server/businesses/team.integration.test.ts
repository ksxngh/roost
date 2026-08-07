// @vitest-environment node
/**
 * Teams, invitations, seats, and capabilities.
 *
 * The properties that matter: a business cannot exceed its seat limit even
 * through pending invites or a race; a token only lets the person it was sent
 * to in; an admin cannot escalate itself or touch the owner; and a granted
 * capability actually unlocks the corresponding action.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  BusinessRole,
  MemberCapability,
  PlanTier,
} from "@/generated/prisma/enums";
import { ForbiddenError, NotFoundError } from "@/server/businesses/access";
import { updateProfile } from "@/server/businesses/businesses";
import {
  AlreadyMemberError,
  InvitationInvalidError,
  SeatLimitError,
  acceptInvitation,
  getInvitationByToken,
  getTeam,
  inviteMember,
  removeMember,
  revokeInvitation,
  transferOwnership,
  updateMember,
} from "@/server/businesses/team";
import { prisma } from "@/server/db";

let seq = 0;

async function makeUser(email?: string) {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: email ?? `team-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

/** A business with an owner, on a given plan. */
async function makeBusiness(plan: PlanTier = PlanTier.PREMIUM) {
  seq += 1;
  const owner = await makeUser();
  const business = await prisma.business.create({
    data: {
      slug: `team-biz-${Date.now()}-${seq}`,
      name: "Northside Plumbing",
      timezone: "America/Vancouver",
      plan,
      members: { create: { userId: owner.id, role: BusinessRole.OWNER } },
    },
  });
  return { ownerId: owner.id, businessId: business.id };
}

/** Add someone at a role directly, for setup. */
async function addMember(
  businessId: string,
  role: BusinessRole,
  capabilities: MemberCapability[] = [],
  email?: string,
) {
  const user = await makeUser(email);
  const member = await prisma.businessMember.create({
    data: { businessId, userId: user.id, role, capabilities },
  });
  return { userId: user.id, memberId: member.id, email: user.email };
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.invitation.deleteMany();
  await prisma.businessMember.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
});

describe("inviteMember", () => {
  it("creates a pending invitation the seat count includes", async () => {
    const { ownerId, businessId } = await makeBusiness();

    await inviteMember(ownerId, businessId, {
      email: "New@Example.com",
      role: BusinessRole.MEMBER,
      capabilities: [MemberCapability.SCHEDULE],
    });

    const invite = await prisma.invitation.findFirstOrThrow({
      where: { businessId },
    });
    expect(invite.email).toBe("new@example.com");
    expect(invite.capabilities).toEqual([MemberCapability.SCHEDULE]);

    const team = await getTeam(ownerId, businessId);
    expect(team.seatsInUse).toBe(2); // owner + invite
  });

  it("drops capabilities when inviting an admin", async () => {
    const { ownerId, businessId } = await makeBusiness();

    await inviteMember(ownerId, businessId, {
      email: "admin@example.com",
      role: BusinessRole.ADMIN,
      capabilities: [MemberCapability.BILLING],
    });

    const invite = await prisma.invitation.findFirstOrThrow({
      where: { businessId },
    });
    expect(invite.capabilities).toEqual([]);
  });

  it("refuses to invite someone already on the team", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const member = await addMember(businessId, BusinessRole.MEMBER);

    await expect(
      inviteMember(ownerId, businessId, {
        email: member.email,
        role: BusinessRole.MEMBER,
        capabilities: [],
      }),
    ).rejects.toBeInstanceOf(AlreadyMemberError);
  });

  it("refreshes an existing invitation rather than duplicating it", async () => {
    const { ownerId, businessId } = await makeBusiness();
    await inviteMember(ownerId, businessId, {
      email: "again@example.com",
      role: BusinessRole.MEMBER,
      capabilities: [],
    });
    await inviteMember(ownerId, businessId, {
      email: "again@example.com",
      role: BusinessRole.ADMIN,
      capabilities: [],
    });

    const invites = await prisma.invitation.findMany({ where: { businessId } });
    expect(invites).toHaveLength(1);
    expect(invites[0]!.role).toBe(BusinessRole.ADMIN);
  });

  it("enforces the seat limit including pending invites", async () => {
    const { ownerId, businessId } = await makeBusiness(PlanTier.PRO);

    // Pro is one seat, already taken by the owner.
    await expect(
      inviteMember(ownerId, businessId, {
        email: "second@example.com",
        role: BusinessRole.MEMBER,
        capabilities: [],
      }),
    ).rejects.toBeInstanceOf(SeatLimitError);
  });

  it("fills exactly up to the limit and no further", async () => {
    const { ownerId, businessId } = await makeBusiness(PlanTier.PREMIUM);
    // Owner is seat 1; invite 7 to reach 8.
    for (let index = 0; index < 7; index += 1) {
      await inviteMember(ownerId, businessId, {
        email: `seat${index}@example.com`,
        role: BusinessRole.MEMBER,
        capabilities: [],
      });
    }
    expect((await getTeam(ownerId, businessId)).seatsInUse).toBe(8);

    await expect(
      inviteMember(ownerId, businessId, {
        email: "overflow@example.com",
        role: BusinessRole.MEMBER,
        capabilities: [],
      }),
    ).rejects.toBeInstanceOf(SeatLimitError);
  });

  it("lets an admin invite a member but not another admin", async () => {
    const { businessId } = await makeBusiness();
    const admin = await addMember(businessId, BusinessRole.ADMIN);

    await expect(
      inviteMember(admin.userId, businessId, {
        email: "member@example.com",
        role: BusinessRole.MEMBER,
        capabilities: [],
      }),
    ).resolves.toBeTruthy();

    await expect(
      inviteMember(admin.userId, businessId, {
        email: "peer@example.com",
        role: BusinessRole.ADMIN,
        capabilities: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses an ordinary member entirely", async () => {
    const { businessId } = await makeBusiness();
    const member = await addMember(businessId, BusinessRole.MEMBER);

    await expect(
      inviteMember(member.userId, businessId, {
        email: "x@example.com",
        role: BusinessRole.MEMBER,
        capabilities: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("acceptInvitation", () => {
  async function invited(role = BusinessRole.MEMBER) {
    const { ownerId, businessId } = await makeBusiness();
    const email = `invitee-${seq}-${Date.now()}@example.com`;
    await inviteMember(ownerId, businessId, {
      email,
      role,
      capabilities: [MemberCapability.SCHEDULE],
    });
    const invite = await prisma.invitation.findFirstOrThrow({
      where: { businessId },
    });
    const user = await makeUser(email);
    return { ownerId, businessId, token: invite.token, userId: user.id, email };
  }

  it("adds the invitee as a member with the granted capabilities", async () => {
    const { businessId, token, userId } = await invited();

    const result = await acceptInvitation(userId, token);

    expect(result.businessId).toBe(businessId);
    const member = await prisma.businessMember.findFirstOrThrow({
      where: { businessId, userId },
    });
    expect(member.role).toBe(BusinessRole.MEMBER);
    expect(member.capabilities).toEqual([MemberCapability.SCHEDULE]);
  });

  it("marks the invitation used so it cannot be replayed", async () => {
    const { token, userId } = await invited();

    await acceptInvitation(userId, token);
    await expect(acceptInvitation(userId, token)).rejects.toBeInstanceOf(
      InvitationInvalidError,
    );
  });

  it("refuses a different person holding the link", async () => {
    const { token } = await invited();
    const stranger = await makeUser("stranger@example.com");

    await expect(acceptInvitation(stranger.id, token)).rejects.toBeInstanceOf(
      InvitationInvalidError,
    );
    expect(await prisma.businessMember.count()).toBe(1); // still just the owner
  });

  it("refuses an expired invitation", async () => {
    const { businessId, userId } = await invited();
    await prisma.invitation.updateMany({
      where: { businessId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const token = (
      await prisma.invitation.findFirstOrThrow({ where: { businessId } })
    ).token;

    await expect(acceptInvitation(userId, token)).rejects.toBeInstanceOf(
      InvitationInvalidError,
    );
  });

  it("refuses to overflow the seats between invite and accept", async () => {
    const { ownerId, businessId } = await makeBusiness(PlanTier.PRO);
    // Free the seat so the invite is allowed, then re-fill it before accept.
    const invite = await prisma.invitation.create({
      data: {
        businessId,
        email: "late@example.com",
        role: BusinessRole.MEMBER,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const user = await makeUser("late@example.com");
    void ownerId;

    // The single Pro seat is already the owner's, so acceptance overflows.
    await expect(
      acceptInvitation(user.id, invite.token),
    ).rejects.toBeInstanceOf(SeatLimitError);
  });
});

describe("revokeInvitation", () => {
  it("removes a pending invitation and frees its seat", async () => {
    const { ownerId, businessId } = await makeBusiness();
    await inviteMember(ownerId, businessId, {
      email: "gone@example.com",
      role: BusinessRole.MEMBER,
      capabilities: [],
    });
    const invite = await prisma.invitation.findFirstOrThrow({
      where: { businessId },
    });

    await revokeInvitation(ownerId, businessId, invite.id);

    expect(await prisma.invitation.count({ where: { businessId } })).toBe(0);
    expect((await getTeam(ownerId, businessId)).seatsInUse).toBe(1);
  });

  it("leaves another business's invitation untouched", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();
    await inviteMember(theirs.ownerId, theirs.businessId, {
      email: "theirs@example.com",
      role: BusinessRole.MEMBER,
      capabilities: [],
    });
    const invite = await prisma.invitation.findFirstOrThrow({
      where: { businessId: theirs.businessId },
    });

    await revokeInvitation(mine.ownerId, mine.businessId, invite.id);

    expect(
      await prisma.invitation.count({ where: { businessId: theirs.businessId } }),
    ).toBe(1);
  });
});

describe("getInvitationByToken", () => {
  it("returns the invitation and flags expiry", async () => {
    const { ownerId, businessId } = await makeBusiness();
    await inviteMember(ownerId, businessId, {
      email: "look@example.com",
      role: BusinessRole.MEMBER,
      capabilities: [],
    });
    const token = (
      await prisma.invitation.findFirstOrThrow({ where: { businessId } })
    ).token;

    const view = await getInvitationByToken(token);
    expect(view?.business.name).toBe("Northside Plumbing");
    expect(view?.expired).toBe(false);
  });

  it("returns null for an unknown token", async () => {
    expect(await getInvitationByToken("nope")).toBeNull();
  });
});

describe("updateMember", () => {
  it("grants and revokes a capability", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const member = await addMember(businessId, BusinessRole.MEMBER);

    await updateMember(ownerId, businessId, member.memberId, {
      capabilities: [MemberCapability.BILLING, MemberCapability.CLIENTS],
    });
    expect(
      (
        await prisma.businessMember.findUniqueOrThrow({
          where: { id: member.memberId },
        })
      ).capabilities,
    ).toEqual([MemberCapability.BILLING, MemberCapability.CLIENTS]);

    await updateMember(ownerId, businessId, member.memberId, {
      capabilities: [],
    });
    expect(
      (
        await prisma.businessMember.findUniqueOrThrow({
          where: { id: member.memberId },
        })
      ).capabilities,
    ).toEqual([]);
  });

  it("clears capabilities when promoting to admin", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const member = await addMember(businessId, BusinessRole.MEMBER, [
      MemberCapability.SCHEDULE,
    ]);

    await updateMember(ownerId, businessId, member.memberId, {
      role: BusinessRole.ADMIN,
    });

    const stored = await prisma.businessMember.findUniqueOrThrow({
      where: { id: member.memberId },
    });
    expect(stored.role).toBe(BusinessRole.ADMIN);
    expect(stored.capabilities).toEqual([]);
  });

  it("refuses to edit the owner", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const ownerMember = await prisma.businessMember.findFirstOrThrow({
      where: { businessId, role: BusinessRole.OWNER },
    });

    await expect(
      updateMember(ownerId, businessId, ownerMember.id, {
        role: BusinessRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("stops an admin promoting itself", async () => {
    const { businessId } = await makeBusiness();
    const admin = await addMember(businessId, BusinessRole.ADMIN);

    await expect(
      updateMember(admin.userId, businessId, admin.memberId, {
        role: BusinessRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("stops an admin editing another admin", async () => {
    const { businessId } = await makeBusiness();
    const admin = await addMember(businessId, BusinessRole.ADMIN);
    const peer = await addMember(businessId, BusinessRole.ADMIN);

    await expect(
      updateMember(admin.userId, businessId, peer.memberId, {
        capabilities: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("removeMember", () => {
  it("removes a member and frees a seat", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const member = await addMember(businessId, BusinessRole.MEMBER);

    await removeMember(ownerId, businessId, member.memberId);

    expect(await prisma.businessMember.count({ where: { businessId } })).toBe(
      1,
    );
  });

  it("refuses to remove the owner", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const ownerMember = await prisma.businessMember.findFirstOrThrow({
      where: { businessId, role: BusinessRole.OWNER },
    });

    await expect(
      removeMember(ownerId, businessId, ownerMember.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses to remove yourself", async () => {
    const { businessId } = await makeBusiness();
    const admin = await addMember(businessId, BusinessRole.ADMIN);

    await expect(
      removeMember(admin.userId, businessId, admin.memberId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hides another business's member behind not-found", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();
    const theirMember = await addMember(theirs.businessId, BusinessRole.MEMBER);

    await expect(
      removeMember(mine.ownerId, mine.businessId, theirMember.memberId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("transferOwnership", () => {
  it("swaps the owner and admin roles", async () => {
    const { ownerId, businessId } = await makeBusiness();
    const heir = await addMember(businessId, BusinessRole.ADMIN);

    await transferOwnership(ownerId, businessId, heir.memberId);

    const owners = await prisma.businessMember.findMany({
      where: { businessId, role: BusinessRole.OWNER },
    });
    expect(owners).toHaveLength(1);
    expect(owners[0]!.userId).toBe(heir.userId);

    const old = await prisma.businessMember.findFirstOrThrow({
      where: { businessId, userId: ownerId },
    });
    expect(old.role).toBe(BusinessRole.ADMIN);
  });

  it("refuses a non-owner", async () => {
    const { businessId } = await makeBusiness();
    const admin = await addMember(businessId, BusinessRole.ADMIN);
    const other = await addMember(businessId, BusinessRole.MEMBER);

    await expect(
      transferOwnership(admin.userId, businessId, other.memberId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("capabilities gate real actions", () => {
  it("lets a member with STOREFRONT edit the business, and blocks one without", async () => {
    const { businessId } = await makeBusiness();
    const granted = await addMember(businessId, BusinessRole.MEMBER, [
      MemberCapability.STOREFRONT,
    ]);
    const plain = await addMember(businessId, BusinessRole.MEMBER);

    await expect(
      updateProfile(granted.userId, businessId, { name: "Renamed" }),
    ).resolves.toBeUndefined();

    await expect(
      updateProfile(plain.userId, businessId, { name: "Nope" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not let a SCHEDULE grant unlock storefront edits", async () => {
    const { businessId } = await makeBusiness();
    const member = await addMember(businessId, BusinessRole.MEMBER, [
      MemberCapability.SCHEDULE,
    ]);

    await expect(
      updateProfile(member.userId, businessId, { name: "Nope" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an admin do it with no explicit grant", async () => {
    const { businessId } = await makeBusiness();
    const admin = await addMember(businessId, BusinessRole.ADMIN);

    await expect(
      updateProfile(admin.userId, businessId, { name: "Admin edit" }),
    ).resolves.toBeUndefined();
  });
});
