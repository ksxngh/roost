"use client";

import { Library, Plus, Star, Archive, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ClassMenu } from "@/components/library/class-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClassSummary } from "@/server/library/classes";
import { createClassAction } from "@/server/library/actions";

type View = { label: string; href: string; icon: typeof Library };

const VIEWS: View[] = [
  { label: "All documents", href: "/library", icon: Library },
  { label: "Favorites", href: "/library?favorite=1", icon: Star },
  { label: "Archived", href: "/library?archived=1", icon: Archive },
  { label: "Trash", href: "/library?deleted=1", icon: Trash2 },
];

export function LibrarySidebar({
  classes,
  activeView,
  activeClassId,
}: {
  classes: ClassSummary[];
  activeView: string;
  activeClassId?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createClassAction({ name: trimmed });
      if (result.ok) {
        toast.success(`Created "${trimmed}".`);
        setName("");
        setCreating(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <aside className="w-full shrink-0 space-y-6 md:w-56">
      <nav aria-label="Library views">
        <ul className="space-y-1">
          {VIEWS.map((view) => {
            const isActive = activeView === view.href && !activeClassId;
            return (
              <li key={view.href}>
                <Link
                  href={view.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <view.icon className="size-4 shrink-0" aria-hidden />
                  {view.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div>
        <div className="mb-2 flex items-center justify-between px-2.5">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Classes
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Add class"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>

        {classes.length === 0 ? (
          <p className="text-muted-foreground px-2.5 text-xs">
            No classes yet. Create one to group your material.
          </p>
        ) : (
          <nav aria-label="Classes">
            <ul className="space-y-1">
              {classes.map((klass) => {
                const isActive = activeClassId === klass.id;
                return (
                  <li key={klass.id} className="group flex items-center">
                    <Link
                      href={`/library?classId=${klass.id}`}
                      aria-current={isActive ? "page" : undefined}
                      // Composed explicitly: the visible name and the bare
                      // count would otherwise run together as "Biology3".
                      aria-label={`${klass.name}, ${pluralize(
                        klass.documentCount,
                        "document",
                      )}`}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                        isActive
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: `var(--${klass.color})` }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {klass.name}
                      </span>
                      <span
                        className="text-muted-foreground text-xs"
                        aria-hidden
                      >
                        {klass.documentCount}
                      </span>
                    </Link>
                    <ClassMenu klass={klass} />
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>New class</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="class-name">Name</Label>
              <Input
                id="class-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Biology 101"
                maxLength={80}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
