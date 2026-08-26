import { normalizeRegion } from "@/server/geo/regions";
import { prisma } from "@/server/db";

/** Raised when a customer's address is outside every service area. */
export class NotServedError extends Error {
  constructor(businessName?: string) {
    super(
      businessName
        ? `${businessName} doesn't serve that area yet.`
        : "That address is outside this provider's service area.",
    );
    this.name = "NotServedError";
  }
}

function key(city: string, region: string): string {
  return `${city.trim().toLowerCase()}|${normalizeRegion(region)}`;
}

/**
 * Whether an address falls inside one of the business's service areas.
 *
 * Service areas are city + region (the marketplace has no per-business
 * coordinates), so the match is by city and normalized region — a provider who
 * lists "Canmore, AB" serves an address geocoded as "Canmore, Alberta". A
 * business with no service areas listed serves everywhere, so an incomplete
 * profile never blocks a booking.
 */
export async function isAddressServed(
  businessId: string,
  address: { city: string; region: string },
): Promise<boolean> {
  const areas = await prisma.serviceArea.findMany({
    where: { businessId },
    select: { city: true, region: true },
  });
  if (areas.length === 0) return true;

  const served = new Set(areas.map((area) => key(area.city, area.region)));
  return served.has(key(address.city, address.region));
}
