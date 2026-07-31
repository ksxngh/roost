import { Queue } from "bullmq";

import { redisConnection } from "@/server/queue/connection";

export const DOCUMENT_QUEUE = "document-processing";

export type ProcessDocumentJob = {
  documentId: string;
  userId: string;
};

let cached: Queue<ProcessDocumentJob> | undefined;

export function documentQueue(): Queue<ProcessDocumentJob> {
  cached ??= new Queue<ProcessDocumentJob>(DOCUMENT_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      // Parsing failures are often transient (memory pressure, OCR startup);
      // back off rather than burning all attempts instantly.
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { age: 3_600, count: 1_000 },
      // Keep failures around long enough to investigate.
      removeOnFail: { age: 7 * 24 * 3_600 },
    },
  });
  return cached;
}

/**
 * Deterministic job id used to deduplicate enqueues.
 * BullMQ rejects custom ids containing ":", so this uses "-".
 */
export function documentJobId(documentId: string): string {
  return `document-${documentId}`;
}

/** Enqueue text extraction for a freshly uploaded document. */
export async function enqueueDocumentProcessing(
  job: ProcessDocumentJob,
): Promise<void> {
  await documentQueue().add("process", job, {
    // Deduplicate: re-enqueuing the same document is a no-op while pending.
    jobId: documentJobId(job.documentId),
  });
}
