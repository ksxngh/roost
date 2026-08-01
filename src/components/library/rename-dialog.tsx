"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

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

/** Shared rename dialog for classes, folders, and documents. */
export function RenameDialog({
  open,
  onOpenChange,
  title,
  currentName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  currentName: string;
  onSubmit: (name: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState(currentName);
  const [pending, startTransition] = useTransition();

  // Reset to the current name each time the dialog opens, so a cancelled edit
  // does not persist into the next one. Adjusting state during render is
  // React's recommended alternative to a synchronizing effect: it re-renders
  // before the browser paints, with no flash of the stale value.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName(currentName);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      onOpenChange(false);
      return;
    }
    startTransition(async () => {
      const result = await onSubmit(trimmed);
      if (result.ok) {
        toast.success("Renamed.");
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Could not rename.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              id="rename-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
