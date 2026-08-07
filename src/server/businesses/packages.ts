import type { ServicePackageModel } from "@/generated/prisma/models";
import type { ServicePackageInput } from "@/lib/validations/scheduling";
import {
  MemberCapability,
  NotFoundError,
  requireCapability,
  requireMembership,
} from "@/server/businesses/access";
import { prisma } from "@/server/db";

/** Above this a storefront stops being a menu and starts being a catalogue. */
export const MAX_PACKAGES = 50;

export class TooManyPackagesError extends Error {
  constructor() {
    super(`A business can offer at most ${MAX_PACKAGES} services.`);
    this.name = "TooManyPackagesError";
  }
}

/** Quote-priced work has no number to store, whatever the form submitted. */
function priceFor(input: ServicePackageInput): number | null {
  return input.pricingModel === "QUOTE" ? null : (input.priceCents ?? null);
}

async function assertCategoryExists(categoryId: string | null | undefined) {
  if (!categoryId) return;
  const category = await prisma.serviceCategory.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) throw new NotFoundError("service category");
}

export async function listPackages(
  userId: string,
  businessId: string,
): Promise<ServicePackageModel[]> {
  await requireMembership(userId, businessId);
  return prisma.servicePackage.findMany({
    where: { businessId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function createPackage(
  userId: string,
  businessId: string,
  input: ServicePackageInput,
): Promise<ServicePackageModel> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.STOREFRONT,
    "add a service",
  );
  await assertCategoryExists(input.categoryId);

  const existing = await prisma.servicePackage.count({ where: { businessId } });
  if (existing >= MAX_PACKAGES) {
    throw new TooManyPackagesError();
  }

  return prisma.servicePackage.create({
    data: {
      businessId,
      name: input.name,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      pricingModel: input.pricingModel,
      priceCents: priceFor(input),
      durationMinutes: input.durationMinutes,
      bufferMinutes: input.bufferMinutes,
      active: input.active,
      // New services sort to the end rather than jumping the queue.
      position: existing,
    },
  });
}

export async function updatePackage(
  userId: string,
  businessId: string,
  packageId: string,
  input: ServicePackageInput,
): Promise<void> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.STOREFRONT,
    "edit a service",
  );
  await assertCategoryExists(input.categoryId);

  // Scoped by businessId, so another business's id reads as missing.
  const { count } = await prisma.servicePackage.updateMany({
    where: { id: packageId, businessId },
    data: {
      name: input.name,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      pricingModel: input.pricingModel,
      priceCents: priceFor(input),
      durationMinutes: input.durationMinutes,
      bufferMinutes: input.bufferMinutes,
      active: input.active,
    },
  });
  if (count === 0) throw new NotFoundError("service");
}

export async function deletePackage(
  userId: string,
  businessId: string,
  packageId: string,
): Promise<void> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.STOREFRONT,
    "remove a service",
  );
  await prisma.servicePackage.deleteMany({
    where: { id: packageId, businessId },
  });
}

/**
 * Reorder the whole list.
 *
 * Ids from another business are ignored rather than rejected: reordering is a
 * drag-and-drop gesture, and a stale id should not lose the user's other
 * changes.
 */
export async function reorderPackages(
  userId: string,
  businessId: string,
  orderedIds: string[],
): Promise<void> {
  await requireCapability(
    userId,
    businessId,
    MemberCapability.STOREFRONT,
    "reorder services",
  );
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.servicePackage.updateMany({
        where: { id, businessId },
        data: { position: index },
      }),
    ),
  );
}
