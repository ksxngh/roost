import { Redis } from "ioredis";

import { serverEnv } from "@/lib/env";

let cached: Redis | undefined;

/**
 * Shared Redis connection for BullMQ.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ: blocking commands must
 * not be aborted by ioredis' retry cap, or workers drop jobs under a brief
 * network blip.
 */
export function redisConnection(): Redis {
  cached ??= new Redis(serverEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return cached;
}
