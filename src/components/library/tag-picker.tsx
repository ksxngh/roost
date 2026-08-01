"use client";

import { Check, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { TagSummary } from "@/server/library/tags";
import {
  createTagAction,
  deleteTagAction,
  tagDocumentAction,
  untagDocumentAction,
} from "@/server/library/actions";

export function TagPicker({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  appliedTagIds,
  tags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  appliedTagIds: string[];
  tags: TagSummary[];
}) {
  const [newTag, setNewTag] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle(tagId: string, applied: boolean) {
    startTransition(async () => {
      const result = applied
        ? await untagDocumentAction(documentId, tagId)
        : await tagDocumentAction(documentId, tagId);
      if (!result.ok) toast.error(result.error);
    });
  }

  /** Deletes the tag everywhere, not just from this document. */
  function remove(tagId: string, tagName: string) {
    startTransition(async () => {
      const result = await deleteTagAction(tagId);
      if (result.ok) toast.success(`Deleted tag "${tagName}".`);
      else toast.error(result.error);
    });
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = newTag.trim();
    if (!name) return;
    startTransition(async () => {
      const created = await createTagAction({ name });
      if (!created.ok) {
        toast.error(created.error);
        return;
      }
      // Apply the new tag immediately — creating one from this dialog always
      // means "tag this document with it".
      const tagId = (created as { data: { id: string } }).data.id;
      const applied = await tagDocumentAction(documentId, tagId);
      if (!applied.ok) toast.error(applied.error);
      else setNewTag("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription className="truncate">
            {documentTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const applied = appliedTagIds.includes(tag.id);
                return (
                  <li key={tag.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => toggle(tag.id, applied)}
                      disabled={pending}
                      aria-pressed={applied}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                        applied
                          ? "bg-primary text-primary-foreground border-transparent"
                          : "hover:bg-accent",
                      )}
                    >
                      {applied ? (
                        <Check className="size-3" aria-hidden />
                      ) : null}
                      {tag.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(tag.id, tag.name)}
                      disabled={pending}
                      aria-label={`Delete tag ${tag.name}`}
                      className="text-muted-foreground hover:text-destructive focus-visible:ring-ring ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No tags yet. Create one below.
            </p>
          )}

          <form onSubmit={handleCreate} className="space-y-2">
            <Label htmlFor="new-tag">New tag</Label>
            <div className="flex gap-2">
              <Input
                id="new-tag"
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                placeholder="midterm"
                maxLength={80}
              />
              <Button
                type="submit"
                size="icon"
                disabled={pending || !newTag.trim()}
              >
                <Plus className="size-4" aria-hidden />
                <span className="sr-only">Create tag</span>
              </Button>
            </div>
          </form>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
