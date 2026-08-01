import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { currentMembership } from "@/server/businesses/access";
import { requireSession } from "@/server/session";

/**
 * Every route in this group requires both a session and a business.
 *
 * Gating on membership here rather than per-page means a new provider page
 * cannot accidentally render for a user who has no business yet — every one
 * of them can assume a business exists.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireSession();

  const membership = await currentMembership(user.id);
  if (!membership) {
    redirect("/onboarding");
  }

  return (
    <AppShell user={{ name: user.name, email: user.email, image: user.image }}>
      {children}
    </AppShell>
  );
}
