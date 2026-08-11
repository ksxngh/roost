/**
 * Grant (or revoke) a platform role by email — the only way an admin exists.
 *
 * There is deliberately no in-app path to platform roles: staff and admins are
 * set out of band by someone with database access, so a compromised app
 * account can never escalate itself. Run:
 *
 *   npm run grant-admin -- someone@example.com          # → ADMIN
 *   npm run grant-admin -- someone@example.com STAFF    # → STAFF
 *   npm run grant-admin -- someone@example.com USER     # revoke
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PlatformRole } from "../src/generated/prisma/enums";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const [email, roleArg = "ADMIN"] = process.argv.slice(2);
  if (!email) {
    throw new Error(
      "Usage: npm run grant-admin -- <email> [USER|STAFF|ADMIN]",
    );
  }

  const role = roleArg.toUpperCase();
  if (!(role in PlatformRole)) {
    throw new Error(`Unknown role "${roleArg}". Use USER, STAFF, or ADMIN.`);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!existing) {
      throw new Error(`No user with email "${email}".`);
    }
    const user = await prisma.user.update({
      where: { email },
      data: { platformRole: role as PlatformRole },
      select: { email: true, platformRole: true },
    });
    console.info(`${user.email} is now ${user.platformRole}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
