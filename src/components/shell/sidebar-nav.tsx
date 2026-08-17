"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/site-config";

/**
 * Vertical nav list shared by the desktop sidebar and the mobile sheet.
 * Active state derives from the first path segment so nested routes
 * (e.g. /library/folder/123) keep their section highlighted.
 */
export function SidebarNav({
  items,
  onNavigate,
  label = "Main navigation",
}: {
  items: NavItem[];
  onNavigate?: () => void;
  /**
   * Accessible name for this landmark. Two nav lists render side by side, so
   * each needs a distinct label — otherwise a screen reader announces two
   * identical "navigation" regions with no way to tell them apart.
   */
  label?: string;
}) {
  const pathname = usePathname();
  const activeSegment = pathname.split("/")[1] ?? "";

  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = activeSegment === item.segment;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
