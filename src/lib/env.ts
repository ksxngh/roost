import { z } from "zod";

/**
 * Environment contract. Server code must import `env` from this module instead
 * of touching `process.env` so that a missing or malformed variable fails at
 * boot with a readable message, not at request time deep in a handler.
 *
 * Variables are optional until the milestone that consumes them makes them
 * required — the schema is the single place where that graduation happens.
 */
const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
});

const clientSchema = z.object({
  // `protocol` matters: a bare "localhost:3000" parses as a valid URL with
  // scheme "localhost:", so plain z.url() would accept it silently.
  NEXT_PUBLIC_APP_URL: z
    .url({ protocol: /^https?$/ })
    .default("http://localhost:3000"),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid server environment variables:\n${formatIssues(result.error)}`,
    );
  }
  return result.data;
}

export function parseClientEnv(
  source: Record<string, string | undefined> = process.env,
): ClientEnv {
  const result = clientSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid client environment variables:\n${formatIssues(result.error)}`,
    );
  }
  return result.data;
}

export const env: ServerEnv = parseServerEnv();
