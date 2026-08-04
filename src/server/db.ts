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
  const adapter = new PrismaPg({
    connectionString: serverEnv().DATABASE_URL,
    /**
     * Pin the session timezone to UTC.
     *
     * Without this the driver sends a `timestamptz` as naive wall-clock text
     * and Postgres interprets it in the *server's* zone, storing an instant
     * offset by however far that zone is from UTC. Reads are distorted by the
     * same amount, so a round trip looks correct and hides it — but the value
     * on disk is wrong, `now()` comparisons in SQL are wrong, and the
     * distortion changes size across a daylight-saving boundary, so rows
     * written in summer and winter stop being comparable.
     *
     * `booking_no_overlap` compares exactly these columns, so this is load
     * bearing for double-booking prevention.
     */
    options: "-c timezone=UTC",
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (serverEnv().NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
