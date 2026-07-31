"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { setTheme } = useTheme();
  // Render a stable placeholder until hydration completes so server and
  // client markup agree (the resolved theme is only knowable in the browser).
  // useSyncExternalStore returns the server snapshot (false) during SSR and
  // the client snapshot (true) after hydration, without an effect.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" disabled>
        <Sun className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Sun
            className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90"
            aria-hidden="true"
          />
          <Moon
            className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
