"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { UserMenu, type UserMenuUser } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { businessNav, settingsNav } from "@/lib/site-config";

/**
 * Authenticated application frame: fixed sidebar on desktop, sheet-based
 * drawer on mobile, sticky topbar with theme control. Pages render into the
 * scrollable main region.
 */
export function AppShell({
  user,
  children,
}: {
  user: UserMenuUser;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-svh w-full">
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center px-4">
          <BrandMark href="/dashboard" />
        </div>
        <Separator />
        <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3">
          <SidebarNav items={businessNav} />
          <SidebarNav items={settingsNav} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="h-14 justify-center px-4">
                <SheetTitle asChild>
                  <BrandMark href="/dashboard" />
                </SheetTitle>
              </SheetHeader>
              <Separator />
              <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3">
                <SidebarNav
                  items={businessNav}
                  onNavigate={() => setMobileNavOpen(false)}
                />
                <SidebarNav
                  items={settingsNav}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu user={user} />
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
