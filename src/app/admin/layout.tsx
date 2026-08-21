import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/skip-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { PlatformRole } from "@/generated/prisma/enums";
import { meetsPlatformRole, platformRoleOf } from "@/server/admin/access";
import { requireSession } from "@/server/session";

/**
 * Every /admin route requires a platform role of STAFF or higher.
 *
 * A user below that sees a 404, not a redirect or a 403 page: the admin
 * surface should be invisible to people who aren't staff, giving no signal
 * that it exists. Gating in the layout means no admin page has to remember to
 * check.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requireSession();
  const role = await platformRoleOf(user.id);
  if (!meetsPlatformRole(role, PlatformRole.STAFF)) {
    notFound();
  }

  return (
    <div className="flex min-h-svh flex-col">
      <SkipLink />
      <header className="bg-background/80 sticky top-0 z-40 flex h-14 items-center gap-4 border-b px-4 backdrop-blur sm:px-6">
        <BrandMark href="/admin" />
        <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
          Admin
        </span>
        <nav
          aria-label="Admin"
          className="ml-2 flex items-center gap-4 text-sm"
        >
          <Link
            href="/admin/verification"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Verification
          </Link>
          <Link
            href="/admin/businesses"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Businesses
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground hidden text-xs sm:inline">
            {role === PlatformRole.ADMIN ? "Administrator" : "Reviewer"}
          </span>
          <ThemeToggle />
        </div>
      </header>
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 outline-none sm:px-6"
      >
        {children}
      </main>
    </div>
  );
}
