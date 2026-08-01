"use client";

import {
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { RenameDialog } from "@/components/library/rename-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pluralize } from "@/lib/format";
import type { FolderSummary } from "@/server/library/folders";
import {
  createFolderAction,
  deleteFolderAction,
  renameFolderAction,
} from "@/server/library/actions";

/**
 * Folders within the current class (or at the library root). Folders are a
 * flat level here; the schema supports nesting and `moveFolder` enforces
 * cycle safety, so deeper navigation can be layered on without a data change.
 */
export function FolderList({
  folders,
  classId,
  activeFolderId,
}: {
  folders: FolderSummary[];
  classId: string | null;
  activeFolderId?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<FolderSummary | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createFolderAction({ name: trimmed, classId });
      if (result.ok) {
        toast.success(`Created "${trimmed}".`);
        setName("");
        setCreating(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete(folder: FolderSummary) {
    startTransition(async () => {
      const result = await deleteFolderAction(folder.id);
      if (result.ok) {
        toast.success("Folder deleted. Its documents were kept.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Folders
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setCreating(true)}
        >
          <FolderPlus className="size-3.5" aria-hidden />
          New folder
        </Button>
      </div>

      {folders.length === 0 ? (
        <p className="text-muted-foreground text-xs">No folders here yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {folders.map((folder) => {
            const href = classId
              ? `/library?classId=${classId}&folderId=${folder.id}`
              : `/library?folderId=${folder.id}`;
            const isActive = activeFolderId === folder.id;
            return (
              <li key={folder.id} className="group">
                <div
                  className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-accent border-transparent"
                      : "hover:bg-accent/60"
                  }`}
                >
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={`${folder.name}, ${pluralize(
                      folder.documentCount,
                      "document",
                    )}`}
                    className="focus-visible:ring-ring flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Folder className="size-3.5 shrink-0" aria-hidden />
                    {folder.name}
                    <span className="text-muted-foreground text-xs" aria-hidden>
                      {folder.documentCount}
                    </span>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                        aria-label={`Actions for ${folder.name}`}
                        disabled={pending}
                      >
                        <MoreHorizontal className="size-3" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => setRenaming(folder)}>
                        <Pencil className="size-4" aria-hidden />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => handleDelete(folder)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Week 1"
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

      <RenameDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="Rename folder"
        currentName={renaming?.name ?? ""}
        onSubmit={async (newName) =>
          renaming
            ? renameFolderAction({ id: renaming.id, name: newName })
            : { ok: false as const, error: "No folder selected." }
        }
      />
    </div>
  );
}
