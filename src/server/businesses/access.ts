import { BusinessRole, MemberCapability } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";

export { MemberCapability };

/** Raised when a record does not exist *or* the caller is not a member. */
export class NotFoundError extends Error {
  constructor(what = "business") {
    super(`That ${what} does not exist.`);
    this.name = "NotFoundError";
  }
}

/** Raised when the caller is a member but their role is insufficient. */
export class ForbiddenError extends Error {
  constructor(action: string) {
    super(`You do not have permission to ${action}.`);
    this.name = "ForbiddenError";
  }
}

export class DuplicateSlugError extends Error {
  constructor() {
    super("That storefront address is already taken.");
    this.name = "DuplicateSlugError";
  }
}

export type Membership = {
  businessId: string;
  role: BusinessRole;
  capabilities: MemberCapability[];
};

/** Roles permitted to change business configuration. */
const EDITOR_ROLES: BusinessRole[] = [BusinessRole.OWNER, BusinessRole.ADMIN];

/**
 * Does this membership grant a capability?
 *
 * OWNER and ADMIN hold everything implicitly — they run the business — so
 * only a MEMBER is checked against their granted list. Keeping this a pure
 * function means the same rule drives both the gates below and the UI that
 * shows a member what they can do.
 */
export function hasCapability(
  membership: Pick<Membership, "role" | "capabilities">,
  capability: MemberCapability,
): boolean {
  if (
    membership.role === BusinessRole.OWNER ||
    membership.role === BusinessRole.ADMIN
  ) {
    return true;
  }
  return membership.capabilities.includes(capability);
}

/**
 * The business a user is currently acting for.
 *
 * A user may belong to several businesses eventually; until an explicit
 * switcher exists, the oldest membership wins so the choice is stable across
 * requests rather than varying with row order.
 */
export async function currentMembership(
  userId: string,
): Promise<Membership | null> {
  const membership = await prisma.businessMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { businessId: true, role: true, capabilities: true },
  });
  return membership;
}

/**
 * Resolve the caller's membership of a specific business.
 *
 * Returns `NotFoundError` rather than a permission error for non-members:
 * a stranger should not be able to learn that a business id exists.
 */
export async function requireMembership(
  userId: string,
  businessId: string,
): Promise<Membership> {
  const membership = await prisma.businessMember.findUnique({
    where: { businessId_userId: { businessId, userId } },
    select: { businessId: true, role: true, capabilities: true },
  });
  if (!membership) {
    throw new NotFoundError();
  }
  return membership;
}

/**
 * Membership plus a specific capability.
 *
 * This is the gate almost every mutation uses. A MEMBER passes only if the
 * capability has been granted to them; OWNER and ADMIN always pass. The
 * `action` is woven into the error so a denied member reads why.
 */
export async function requireCapability(
  userId: string,
  businessId: string,
  capability: MemberCapability,
  action: string,
): Promise<Membership> {
  const membership = await requireMembership(userId, businessId);
  if (!hasCapability(membership, capability)) {
    throw new ForbiddenError(action);
  }
  return membership;
}

/**
 * Membership plus admin-or-owner rank, for actions no capability grant
 * should unlock — chiefly managing the team itself.
 */
export async function requireEditor(
  userId: string,
  businessId: string,
  action: string,
): Promise<Membership> {
  const membership = await requireMembership(userId, businessId);
  if (!EDITOR_ROLES.includes(membership.role)) {
    throw new ForbiddenError(action);
  }
  return membership;
}

/** Owner-only gate, for irreversible or billing-level actions. */
export async function requireOwner(
  userId: string,
  businessId: string,
  action: string,
): Promise<Membership> {
  const membership = await requireMembership(userId, businessId);
  if (membership.role !== BusinessRole.OWNER) {
    throw new ForbiddenError(action);
  }
  return membership;
}
