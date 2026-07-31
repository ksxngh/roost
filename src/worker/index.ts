/**
 * Background worker entry point. Run alongside the web app:
 *
 *   npm run worker
 *
 * Kept as a separate process so document parsing and OCR never block a
 * request or a serverless function's execution budget
 * (see docs/adr/0001-nextjs-fullstack.md).
 */
import { Worker } from "bullmq";

import { processDocument } from "@/server/documents/process-document";
import { redisConnection } from "@/server/queue/connection";
import { DOCUMENT_QUEUE, type ProcessDocumentJob } from "@/server/queue/queues";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);

const worker = new Worker<ProcessDocumentJob>(
  DOCUMENT_QUEUE,
  async (job) => {
    await processDocument(job.data.documentId);
  },
  {
    connection: redisConnection(),
    concurrency: CONCURRENCY,
    // OCR on a large image can legitimately run for a while.
    lockDuration: 5 * 60_000,
  },
);

worker.on("completed", (job) => {
  console.info(`[worker] processed document ${job.data.documentId}`);
});

worker.on("failed", (job, error) => {
  console.error(
    `[worker] failed document ${job?.data.documentId ?? "unknown"}:`,
    error.message,
  );
});

console.info(
  `[worker] listening on "${DOCUMENT_QUEUE}" with concurrency ${CONCURRENCY}`,
);

/** Finish in-flight jobs before exiting so a deploy cannot orphan work. */
async function shutdown(signal: string): Promise<void> {
  console.info(`[worker] ${signal} received, draining…`);
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
