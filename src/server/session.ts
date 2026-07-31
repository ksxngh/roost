import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth, type Session } from "@/server/auth";

/**
 * Session lookup for React Server Components, deduplicated per request via
 * React cache so layout + page checks cost one database hit.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/** Gate for protected routes: redirects signed-out visitors to /login. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
