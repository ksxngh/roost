import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env";

/**
 * Singleton Prisma client. Next.js dev mode reloads modules on every edit;
 * caching the instance on globalThis prevents exhausting the connection pool
 * with orphaned clients.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: serverEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (serverEnv().NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
