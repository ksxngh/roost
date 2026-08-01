"use server";

import { revalidatePath } from "next/cache";

import {
  businessSlugSchema,
  createBusinessSchema,
  serviceAreaSchema,
  updateBusinessProfileSchema,
} from "@/lib/validations/business";
import {
  availabilityExceptionSchema,
  bookingSettingsSchema,
  businessHoursSchema,
  servicePackageSchema,
} from "@/lib/validations/scheduling";
import {
  addException,
  removeException,
  setWeeklyHours,
  updateBookingSettings,
} from "@/server/businesses/availability";
import {
  TooManyPackagesError,
  createPackage,
  deletePackage,
  reorderPackages,
  updatePackage,
} from "@/server/businesses/packages";
import {
  DuplicateSlugError,
  ForbiddenError,
  NotFoundError,
  currentMembership,
} from "@/server/businesses/access";
import {
  NotReadyError,
  addServiceArea,
  createBusiness,
  removeServiceArea,
  setCategories,
  submitForReview,
  updateProfile,
  updateSlug,
} from "@/server/businesses/businesses";
import { deleteBusinessDocument } from "@/server/businesses/documents";
import { requireSession } from "@/server/session";

export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? Record<never, never> : { data: T }))
  | { ok: false; error: string };

function invalid(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

/**
 * Shared wrapper: authenticate, resolve the caller's business, run, then
 * revalidate. Known domain errors become messages safe to show a provider;
 * anything else is logged and replaced, so internals never reach the client.
 */
async function mutation<T>(
  run: (context: { userId: string; businessId: string }) => Promise<T>,
): Promise<ActionResult<T>> {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) {
    return invalid("Set up your business before making changes.");
  }
  try {
    const data = await run({
      userId: user.id,
      businessId: membership.businessId,
    });
    revalidatePath("/storefront");
    revalidatePath("/services");
    revalidatePath("/availability");
    revalidatePath("/dashboard");
    return { ok: true, data } as ActionResult<T>;
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof DuplicateSlugError ||
      error instanceof NotReadyError ||
      error instanceof TooManyPackagesError
    ) {
      return { ok: false, error: error.message };
    }
    console.error("[business action] unexpected failure:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Onboarding. Separate from `mutation` because it runs *before* a membership
 * exists — and it refuses to create a second business for a user who already
 * has one, which would silently orphan the first.
 */
export async function createBusinessAction(input: unknown) {
  const parsed = createBusinessSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);

  const { user } = await requireSession();
  const existing = await currentMembership(user.id);
  if (existing) {
    return invalid("You already have a business set up.");
  }

  try {
    const business = await createBusiness(user.id, parsed.data);
    revalidatePath("/dashboard");
    return {
      ok: true as const,
      data: { id: business.id, slug: business.slug },
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof DuplicateSlugError) {
      return { ok: false as const, error: error.message };
    }
    console.error("[business action] create failed:", error);
    return {
      ok: false as const,
      error: "Could not create your business. Please try again.",
    };
  }
}

export async function updateProfileAction(input: unknown) {
  const parsed = updateBusinessProfileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation(({ userId, businessId }) =>
    updateProfile(userId, businessId, parsed.data),
  );
}

export async function updateSlugAction(slug: unknown) {
  const parsed = businessSlugSchema.safeParse(slug);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation(({ userId, businessId }) =>
    updateSlug(userId, businessId, parsed.data),
  );
}

export async function setCategoriesAction(categoryIds: string[]) {
  if (categoryIds.length === 0) {
    return invalid("Choose at least one service you offer.");
  }
  return mutation(({ userId, businessId }) =>
    setCategories(userId, businessId, categoryIds),
  );
}

export async function addServiceAreaAction(input: unknown) {
  const parsed = serviceAreaSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation(({ userId, businessId }) =>
    addServiceArea(userId, businessId, parsed.data),
  );
}

export async function removeServiceAreaAction(areaId: string) {
  return mutation(({ userId, businessId }) =>
    removeServiceArea(userId, businessId, areaId),
  );
}

export async function deleteDocumentAction(documentId: string) {
  return mutation(({ userId, businessId }) =>
    deleteBusinessDocument(userId, businessId, documentId),
  );
}

export async function submitForReviewAction() {
  return mutation(({ userId, businessId }) =>
    submitForReview(userId, businessId),
  );
}

// ── Services and availability ────────────────────────────────────────────

export async function createPackageAction(input: unknown) {
  const parsed = servicePackageSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation(async ({ userId, businessId }) => {
    const created = await createPackage(userId, businessId, parsed.data);
    return { id: created.id };
  });
}

export async function updatePackageAction(packageId: string, input: unknown) {
  const parsed = servicePackageSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation(({ userId, businessId }) =>
    updatePackage(userId, businessId, packageId, parsed.data),
  );
}

export async function deletePackageAction(packageId: string) {
  return mutation(({ userId, businessId }) =>
    deletePackage(userId, businessId, packageId),
  );
}

export async function reorderPackagesAction(orderedIds: string[]) {
  return mutation(({ userId, businessId }) =>
    reorderPackages(userId, businessId, orderedIds),
  );
}

export async function setWeeklyHoursAction(input: unknown) {
  const parsed = businessHoursSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation(({ userId, businessId }) =>
    setWeeklyHours(userId, businessId, parsed.data),
  );
}

export async function addExceptionAction(input: unknown) {
  const parsed = availabilityExceptionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation(({ userId, businessId }) =>
    addException(userId, businessId, parsed.data),
  );
}

export async function removeExceptionAction(exceptionId: string) {
  return mutation(({ userId, businessId }) =>
    removeException(userId, businessId, exceptionId),
  );
}

export async function updateBookingSettingsAction(input: unknown) {
  const parsed = bookingSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);
  return mutation(({ userId, businessId }) =>
    updateBookingSettings(userId, businessId, parsed.data),
  );
}
