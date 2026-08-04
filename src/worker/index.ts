import { Worker } from "bullmq";

import {
  sweepBookingReminders,
  sweepDocumentExpiry,
} from "@/server/notifications/sweeps";
import { redisConnection } from "@/server/queue/connection";
import {
  JOBS_QUEUE,
  type JobName,
  type JobPayload,
  installSchedules,
} from "@/server/queue/queues";
import { prisma } from "@/server/db";

/**
 * Background worker.
 *
 * A separate process, not a route: this work outlives any request, and a web
 * dyno being recycled mid-sweep must not lose it. Run with `npm run worker`.
 */

const HANDLERS: Record<
  JobName,
  (options: { now?: Date }) => Promise<{ considered: number; notified: number }>
> = {
  "booking-reminders": sweepBookingReminders,
  "document-expiry": sweepDocumentExpiry,
};

async function main() {
  await installSchedules();

  const worker = new Worker<JobPayload>(
    JOBS_QUEUE,
    async (job) => {
      const handler = HANDLERS[job.name as JobName];
      if (!handler) {
        // Throwing would retry forever on a job this build simply does not
        // know about, which is noise rather than a signal.
        console.warn(`[worker] no handler for "${job.name}", skipping`);
        return { skipped: true };
      }

      const now = job.data.now ? new Date(job.data.now) : undefined;
      const result = await handler({ now });
      console.info(
        `[worker] ${job.name}: ${result.notified}/${result.considered} notified`,
      );
      return result;
    },
    {
      connection: redisConnection(),
      // Sweeps touch the database and a mail provider; a small concurrency
      // keeps a backlog moving without stampeding either.
      concurrency: 2,
    },
  );

  worker.on("failed", (job, error) => {
    console.error(`[worker] ${job?.name ?? "unknown"} failed:`, error);
  });

  console.info(`[worker] listening on "${JOBS_QUEUE}"`);

  /**
   * Drain in flight work before exiting.
   *
   * Without this a deploy can kill a sweep between sending a reminder and
   * writing its marker, which duplicates mail on the next run.
   */
  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal} received, finishing current jobs…`);
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error("[worker] failed to start:", error);
  process.exit(1);
});
