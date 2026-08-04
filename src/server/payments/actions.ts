"use server";

import { revalidatePath } from "next/cache";

import {
  ForbiddenError,
  NotFoundError,
  currentMembership,
} from "@/server/businesses/access";
import {
  refreshConnectStatus,
  startConnectOnboarding,
} from "@/server/payments/connect";
import { StripeNotConfiguredError } from "@/server/payments/stripe";
import { getSession } from "@/server/session";

function invalid(message: string) {
  return { ok: false as const, error: message };
}

async function ownerContext() {
  const session = await getSession();
  if (!session) return null;
  const membership = await currentMembership(session.user.id);
  if (!membership) return null;
  return { userId: session.user.id, businessId: membership.businessId };
}

/**
 * Returns a Stripe onboarding URL for the client to navigate to.
 *
 * The redirect happens in the browser rather than as a server `redirect()`
 * so a failure can be shown in place instead of throwing the owner onto an
 * error page mid-signup.
 */
export async function startStripeOnboardingAction() {
  const context = await ownerContext();
  if (!context) return invalid("Set up your business first.");

  try {
    const { url } = await startConnectOnboarding(
      context.userId,
      context.businessId,
    );
    return { ok: true as const, data: { url } };
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return invalid("Payments are not configured on this deployment yet.");
    }
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      return invalid(error.message);
    }
    console.error("[stripe] onboarding failed:", error);
    return invalid("Could not reach Stripe. Please try again.");
  }
}

/** Pull the latest account state from Stripe after onboarding. */
export async function refreshStripeStatusAction() {
  const context = await ownerContext();
  if (!context) return invalid("Set up your business first.");

  try {
    const status = await refreshConnectStatus(context.businessId);
    revalidatePath("/settings/payments");
    revalidatePath("/dashboard");
    return { ok: true as const, data: status };
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return invalid("Payments are not configured on this deployment yet.");
    }
    console.error("[stripe] status refresh failed:", error);
    return invalid("Could not reach Stripe. Please try again.");
  }
}
