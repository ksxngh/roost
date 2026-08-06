"use server";

import { revalidatePath } from "next/cache";

import {
  ForbiddenError,
  NotFoundError,
  currentMembership,
} from "@/server/businesses/access";
import { setClientArchived, setClientNotes } from "@/server/businesses/clients";
import { getSession } from "@/server/session";

function invalid(message: string) {
  return { ok: false as const, error: message };
}

async function mutation(
  clientId: string,
  run: (context: { userId: string; businessId: string }) => Promise<void>,
) {
  const session = await getSession();
  if (!session) return invalid("Sign in to manage clients.");

  const membership = await currentMembership(session.user.id);
  if (!membership) return invalid("Set up your business first.");

  try {
    await run({ userId: session.user.id, businessId: membership.businessId });
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      return invalid(error.message);
    }
    console.error("[client action] unexpected failure:", error);
    return invalid("Something went wrong. Please try again.");
  }
}

const MAX_NOTES = 2_000;

export async function setClientNotesAction(clientId: string, notes: string) {
  if (notes.length > MAX_NOTES) {
    return invalid(`Keep notes under ${MAX_NOTES} characters.`);
  }
  return mutation(clientId, ({ userId, businessId }) =>
    setClientNotes(userId, businessId, clientId, notes),
  );
}

export async function setClientArchivedAction(
  clientId: string,
  archived: boolean,
) {
  return mutation(clientId, ({ userId, businessId }) =>
    setClientArchived(userId, businessId, clientId, archived),
  );
}
