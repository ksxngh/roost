"use server";

import { revalidatePath } from "next/cache";

import { ModerationAction } from "@/generated/prisma/enums";
import { ForbiddenError, NotFoundError } from "@/server/businesses/access";
import {
  InvalidTransitionError,
  moderateBusiness,
} from "@/server/admin/verification";
import { getSession } from "@/server/session";

type Result = { ok: true } | { ok: false; error: string };

function invalid(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

const ACTIONS = new Set<string>(Object.values(ModerationAction));

function translate(error: unknown): { ok: false; error: string } | null {
  if (
    error instanceof InvalidTransitionError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError
  ) {
    return invalid(error.message);
  }
  return null;
}

/**
 * Apply a moderation decision from the admin UI.
 *
 * The action string is validated against the enum before anything else, so a
 * tampered form field cannot reach the service with an unknown verb. All
 * authorization is re-checked in `moderateBusiness`; this wrapper only shapes
 * errors for the client and refreshes the affected pages.
 */
export async function moderateAction(
  businessId: string,
  action: string,
  note?: string,
): Promise<Result> {
  if (!ACTIONS.has(action)) return invalid("Unknown action.");

  const session = await getSession();
  if (!session) return invalid("Sign in to continue.");

  try {
    await moderateBusiness(
      session.user.id,
      businessId,
      action as ModerationAction,
      { note },
    );
    revalidatePath("/admin/verification");
    revalidatePath(`/admin/verification/${businessId}`);
    return { ok: true };
  } catch (error) {
    const known = translate(error);
    if (known) return known;
    console.error("[admin] moderation failed:", error);
    return invalid("Could not apply that decision. Please try again.");
  }
}
