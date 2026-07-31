// @vitest-environment node
/**
 * Verifies the real BullMQ wiring against Redis: a job enqueued by the web
 * app is picked up by a worker with the payload intact, and duplicate
 * enqueues collapse. The unit tests stub the queue, so without this the
 * connection settings would be untested.
 */
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { documentJobId } from "@/server/queue/queues";

const QUEUE = "test-document-processing";
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

describe("document queue", () => {
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

  it("collapses duplicate enqueues of the same document", async () => {
    const jobId = documentJobId("doc_1");
    await queue.add("process", { documentId: "doc_1" }, { jobId });
    await queue.add("process", { documentId: "doc_1" }, { jobId });

    expect(await queue.getWaitingCount()).toBe(1);
  });

  it("produces job ids BullMQ accepts", async () => {
    // Regression guard: BullMQ rejects custom ids containing ":".
    expect(documentJobId("doc_1")).not.toContain(":");
    await expect(
      queue.add("process", { documentId: "d" }, { jobId: documentJobId("d") }),
    ).resolves.toBeTruthy();
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
