/**
 * Seeds the fixed reference data the marketplace depends on.
 *
 * Service categories are seeded rather than user-created because their slugs
 * are public URLs (/services/plumbing) and need to be stable across
 * environments. Re-running is safe: rows are upserted by slug.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

/** The trades the marketplace covers, in browse order. */
const SERVICE_CATEGORIES: {
  slug: string;
  name: string;
  description: string;
}[] = [
  {
    slug: "interior-cleaning",
    name: "Interior Cleaning",
    description: "Recurring and one-off home cleaning.",
  },
  {
    slug: "exterior-cleaning",
    name: "Exterior Cleaning",
    description: "Pressure washing, siding, and windows.",
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    description: "Repairs, installs, and emergency callouts.",
  },
  {
    slug: "electricians",
    name: "Electricians",
    description: "Licensed electrical work and fixture installs.",
  },
  {
    slug: "hvac",
    name: "HVAC",
    description: "Heating, cooling, and ventilation service.",
  },
  {
    slug: "handyman",
    name: "Handyman",
    description: "Small repairs and odd jobs around the home.",
  },
  {
    slug: "appliance-repair",
    name: "Appliance Repair",
    description: "Diagnosis and repair of major appliances.",
  },
  {
    slug: "carpets",
    name: "Carpets",
    description: "Carpet and upholstery cleaning.",
  },
  {
    slug: "painting",
    name: "Painting",
    description: "Interior and exterior painting.",
  },
  {
    slug: "roofing",
    name: "Roofing",
    description: "Roof repair, replacement, and inspection.",
  },
  {
    slug: "contractors",
    name: "Contractors",
    description: "Renovations and general contracting.",
  },
  {
    slug: "concrete-masonry",
    name: "Concrete & Masonry",
    description: "Driveways, walkways, and stonework.",
  },
  {
    slug: "landscaping",
    name: "Landscaping",
    description: "Design, planting, and yard transformation.",
  },
  {
    slug: "lawn-care",
    name: "Lawn Care",
    description: "Mowing, fertilizing, and seasonal upkeep.",
  },
  {
    slug: "pool-cleaning",
    name: "Pool Cleaning",
    description: "Pool maintenance, opening, and closing.",
  },
  {
    slug: "pest-removal",
    name: "Pest Removal",
    description: "Inspection, treatment, and prevention.",
  },
  {
    slug: "junk-removal",
    name: "Junk Removal",
    description: "Hauling and disposal of unwanted items.",
  },
  {
    slug: "moving",
    name: "Moving",
    description: "Local moves, packing, and loading help.",
  },
  {
    slug: "home-inspection",
    name: "Home Inspection",
    description: "Pre-purchase and maintenance inspections.",
  },
  {
    slug: "locksmith",
    name: "Locksmith",
    description: "Lockouts, rekeying, and hardware installs.",
  },
  {
    slug: "electronics-repair",
    name: "Electronics Repair",
    description: "In-home device and system repair.",
  },
  {
    slug: "car-detailing",
    name: "Car Detailing",
    description: "Mobile interior and exterior detailing.",
  },
  {
    slug: "mobile-mechanic",
    name: "Mobile Mechanic",
    description: "Vehicle service at your driveway.",
  },
  {
    slug: "roadside",
    name: "Tow Trucks / Roadside",
    description: "Towing, boosts, and roadside assistance.",
  },
  {
    slug: "dog-walking",
    name: "Dog Walking",
    description: "Scheduled walks and pet visits.",
  },
  {
    slug: "miscellaneous",
    name: "Miscellaneous",
    description: "Everything else around the home.",
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed.");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  for (const [index, category] of SERVICE_CATEGORIES.entries()) {
    await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      create: { ...category, position: index },
      update: {
        name: category.name,
        description: category.description,
        position: index,
      },
    });
  }

  const total = await prisma.serviceCategory.count();
  console.info(`Seeded service categories (${total} total).`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
