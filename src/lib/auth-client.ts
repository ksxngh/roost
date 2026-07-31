"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client. Base URL defaults to the current origin,
 * which matches the API route at /api/auth/[...all].
 */
export const authClient = createAuthClient();

/** Reactive session hook for client components. */
export const { useSession } = authClient;
