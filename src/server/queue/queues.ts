import { Queue } from "bullmq";

import { redisConnection } from "@/server/queue/connection";

export const JOBS_QUEUE = "roost-jobs";

/**
 * Recurring background work.
 *
 * Both are **sweeps** rather than per-record delayed jobs. A delayed job
 * scheduled at booking time would have to be found and cancelled whenever the
 * booking moved or was called off, and would be lost entirely if Redis were
 * ever flushed. A sweep re-derives what needs doing from the database on
 * every run, so it is naturally correct after a restart, a data change, or an
 * outage.
 */
export type JobName = "booking-reminders" | "document-expiry";

export type JobPayload = {
  /** Overridable so a test can drive the sweep at a chosen instant. */
  now?: string;
};

let cached: Queue<JobPayload> | undefined;

export function jobsQueue(): Queue<JobPayload> {
  cached ??= new Queue<JobPayload>(JOBS_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      // Transient failures (a mail provider blip, a database failover) are
      // the common case, so back off rather than burning attempts instantly.
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 3_600, count: 500 },
      // Keep failures long enough to actually investigate them.
      removeOnFail: { age: 7 * 24 * 3_600 },
    },
  });
  return cached;
}

/**
 * BullMQ rejects custom job ids containing ":", which is easy to reintroduce
 * and fails only at enqueue time — hence the dedicated helper and its test.
 */
export function jobId(name: JobName, discriminator: string): string {
  return `${name}-${discriminator}`;
}

/** Run a sweep once, now. Used by the schedule and by operators. */
export async function enqueueSweep(
  name: JobName,
  payload: JobPayload = {},
): Promise<void> {
  await jobsQueue().add(name, payload);
}

/** How often each sweep runs. */
export const SCHEDULES: Record<JobName, string> = {
  // Every 15 minutes: fine-grained enough that a reminder lands close to its
  // intended hour without hammering the database.
  "booking-reminders": "*/15 * * * *",
  // Daily at 08:00 UTC — document expiry is not urgent to the minute.
  "document-expiry": "0 8 * * *",
};

/**
 * Install the repeatable schedules.
 *
 * Idempotent on the scheduler id, so a worker restarting does not accumulate
 * duplicate schedules.
 */
export async function installSchedules(): Promise<void> {
  const queue = jobsQueue();
  for (const [name, pattern] of Object.entries(SCHEDULES)) {
    await queue.upsertJobScheduler(
      jobId(name as JobName, "schedule"),
      { pattern },
      { name },
    );
  }
}
