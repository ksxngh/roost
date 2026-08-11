import { PlatformRole } from "@/generated/prisma/enums";
import { ForbiddenError } from "@/server/businesses/access";
import { prisma } from "@/server/db";

export { PlatformRole };

/**
 * Rank of a platform role. Higher is more privileged. A gate that requires
 * STAFF is satisfied by an ADMIN, never the other way round.
 */
const RANK: Record<PlatformRole, number> = {
  [PlatformRole.USER]: 0,
  [PlatformRole.STAFF]: 1,
  [PlatformRole.ADMIN]: 2,
};

/** Does `role` meet or exceed `minimum`? Pure, so the UI can reuse it. */
export function meetsPlatformRole(
  role: PlatformRole,
  minimum: PlatformRole,
): boolean {
  return RANK[role] >= RANK[minimum];
}

/** A user's platform role, or USER if the user somehow does not exist. */
export async function platformRoleOf(userId: string): Promise<PlatformRole> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  return user?.platformRole ?? PlatformRole.USER;
}

/**
 * Gate an admin surface. Throws `ForbiddenError` — the same error the rest of
 * the app maps to a 403 — when the caller's platform role is below `minimum`.
 * Returns the caller's role so a handler can branch (e.g. STAFF sees the queue
 * read-only while ADMIN gets the decision buttons).
 */
export async function requirePlatformRole(
  userId: string,
  minimum: PlatformRole,
  action: string,
): Promise<PlatformRole> {
  const role = await platformRoleOf(userId);
  if (!meetsPlatformRole(role, minimum)) {
    throw new ForbiddenError(action);
  }
  return role;
}
