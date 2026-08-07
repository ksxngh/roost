"use server";

import { revalidatePath } from "next/cache";

import { BusinessRole, MemberCapability } from "@/generated/prisma/enums";
import {
  ForbiddenError,
  NotFoundError,
  currentMembership,
} from "@/server/businesses/access";
import { inviteMemberSchema, updateMemberSchema } from "@/lib/validations/team";
import { sendInvitation } from "@/server/notifications/invitation-mail";
import {
  AlreadyMemberError,
  InvitationInvalidError,
  SeatLimitError,
  acceptInvitation,
  inviteMember,
  removeMember,
  revokeInvitation,
  transferOwnership,
  updateMember,
} from "@/server/businesses/team";
import { getSession } from "@/server/session";

export type ActionResult<T = void> =
  | { ok: false; error: string }
  | ({ ok: true } & (T extends void ? Record<never, never> : { data: T }));

function invalid(message: string): { ok: false; error: string } {
  return { ok: false as const, error: message };
}

type Context =
  | { error: { ok: false; error: string } }
  | { userId: string; businessId: string };

async function ownerOrAdmin(): Promise<Context> {
  const session = await getSession();
  if (!session) return { error: invalid("Sign in to manage your team.") };
  const membership = await currentMembership(session.user.id);
  if (!membership) return { error: invalid("Set up your business first.") };
  return { userId: session.user.id, businessId: membership.businessId };
}

function translate(error: unknown): { ok: false; error: string } | null {
  if (
    error instanceof SeatLimitError ||
    error instanceof AlreadyMemberError ||
    error instanceof InvitationInvalidError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError
  ) {
    return invalid(error.message);
  }
  return null;
}

export async function inviteMemberAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);

  const context = await ownerOrAdmin();
  if ("error" in context) return context.error;

  try {
    const invitation = await inviteMember(context.userId, context.businessId, {
      email: parsed.data.email,
      role: parsed.data.role as BusinessRole,
      capabilities: parsed.data.capabilities as MemberCapability[],
    });
    // Mail carries the token; a failure here must not lose the invitation,
    // which already exists and shows on the team page.
    await sendInvitation({
      businessId: context.businessId,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
    }).catch((error: unknown) => {
      console.error("[team] invitation email failed:", error);
    });

    revalidatePath("/settings/team");
    return { ok: true as const };
  } catch (error) {
    const known = translate(error);
    if (known) return known;
    console.error("[team] invite failed:", error);
    return invalid("Could not send the invitation. Please try again.");
  }
}

async function teamMutation(
  run: (context: { userId: string; businessId: string }) => Promise<void>,
): Promise<ActionResult> {
  const context = await ownerOrAdmin();
  if ("error" in context) return context.error;
  try {
    await run(context);
    revalidatePath("/settings/team");
    return { ok: true as const };
  } catch (error) {
    const known = translate(error);
    if (known) return known;
    console.error("[team] mutation failed:", error);
    return invalid("Something went wrong. Please try again.");
  }
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<ActionResult> {
  return teamMutation(({ userId, businessId }) =>
    revokeInvitation(userId, businessId, invitationId),
  );
}

export async function updateMemberAction(
  memberId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateMemberSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return teamMutation(({ userId, businessId }) =>
    updateMember(userId, businessId, memberId, {
      role: parsed.data.role as BusinessRole | undefined,
      capabilities: parsed.data.capabilities as MemberCapability[] | undefined,
    }),
  );
}

export async function removeMemberAction(
  memberId: string,
): Promise<ActionResult> {
  return teamMutation(({ userId, businessId }) =>
    removeMember(userId, businessId, memberId),
  );
}

export async function transferOwnershipAction(
  memberId: string,
): Promise<ActionResult> {
  return teamMutation(({ userId, businessId }) =>
    transferOwnership(userId, businessId, memberId),
  );
}

/** Called from the accept page; the caller must be signed in. */
export async function acceptInvitationAction(
  token: string,
): Promise<ActionResult<{ businessId: string }>> {
  const session = await getSession();
  if (!session) return invalid("Sign in to accept this invitation.");

  try {
    const { businessId } = await acceptInvitation(session.user.id, token);
    revalidatePath("/dashboard");
    return { ok: true as const, data: { businessId } };
  } catch (error) {
    const known = translate(error);
    if (known) return known;
    console.error("[team] accept failed:", error);
    return invalid("Could not accept the invitation. Please try again.");
  }
}
