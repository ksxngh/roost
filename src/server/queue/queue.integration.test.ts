// @vitest-environment node
/**
 * Verifies the real BullMQ wiring against Redis: a job enqueued by the web
 * app is picked up by a worker with its payload intact, duplicate enqueues
 * collapse, failures retry, and repeatable schedules install idempotently.
 * Everything else stubs the queue, so without this the connection and
 * scheduling settings would be untested.
 */
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SCHEDULES, jobId } from "@/server/queue/queues";

const QUEUE = "test-roost-jobs";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

type Payload = { documentId: string };

let connection: Redis;
let queue: Queue<Payload>;

beforeAll(() => {
  connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  queue = new Queue<Payload>(QUEUE, { connection });
});

afterAll(async () => {
  await queue.close();
  connection.disconnect();
});

beforeEach(async () => {
  await queue.obliterate({ force: true });
});

describe("jobs queue", () => {
  it("delivers an enqueued job to a worker with its payload", async () => {
    const received: string[] = [];
    const worker = new Worker<Payload>(
      QUEUE,
      async (job) => {
        received.push(job.data.documentId);
      },
      { connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }) },
    );

    const completed = new Promise<void>((resolve) =>
      worker.once("completed", () => resolve()),
    );
    await queue.add("process", { documentId: "doc_42" });
    await completed;

    expect(received).toEqual(["doc_42"]);
    await worker.close();
  });

  it("collapses duplicate enqueues of the same id", async () => {
    const id = jobId("booking-reminders", "doc_1");
    await queue.add("process", { documentId: "doc_1" }, { jobId: id });
    await queue.add("process", { documentId: "doc_1" }, { jobId: id });

    expect(await queue.getWaitingCount()).toBe(1);
  });

  it("produces job ids BullMQ accepts", async () => {
    // Regression guard: BullMQ rejects custom ids containing ":", and it
    // fails only at enqueue time.
    const id = jobId("booking-reminders", "schedule");
    expect(id).not.toContain(":");
    await expect(
      queue.add("process", { documentId: "d" }, { jobId: id }),
    ).resolves.toBeTruthy();
  });

  it("installs a repeatable schedule without duplicating it", async () => {
    const id = jobId("booking-reminders", "schedule");
    await queue.upsertJobScheduler(
      id,
      { pattern: SCHEDULES["booking-reminders"] },
      { name: "booking-reminders" },
    );
    await queue.upsertJobScheduler(
      id,
      { pattern: SCHEDULES["booking-reminders"] },
      { name: "booking-reminders" },
    );

    const schedulers = await queue.getJobSchedulers();
    expect(schedulers.filter((s) => s.key === id)).toHaveLength(1);
  });

  it("uses cron patterns BullMQ can parse", async () => {
    for (const [name, pattern] of Object.entries(SCHEDULES)) {
      await expect(
        queue.upsertJobScheduler(jobId(name as "booking-reminders", "probe"), {
          pattern,
        }),
      ).resolves.toBeTruthy();
    }
  });

  it("retries a failing job up to the configured attempts", async () => {
    let attempts = 0;
    const worker = new Worker<Payload>(
      QUEUE,
      async () => {
        attempts += 1;
        throw new Error("boom");
      },
      { connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }) },
    );

    const failed = new Promise<void>((resolve) => {
      worker.on("failed", (job) => {
        if ((job?.attemptsMade ?? 0) >= 2) resolve();
      });
    });

    await queue.add(
      "process",
      { documentId: "doc_retry" },
      { attempts: 2, backoff: { type: "fixed", delay: 10 } },
    );
    await failed;

    expect(attempts).toBe(2);
    await worker.close();
  });
});
