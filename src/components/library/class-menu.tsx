"use client";

import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { RenameDialog } from "@/components/library/rename-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClassSummary } from "@/server/library/classes";
import {
  archiveClassAction,
  deleteClassAction,
  renameClassAction,
} from "@/server/library/actions";

export function ClassMenu({ klass }: { klass: ClassSummary }) {
  const [renaming, setRenaming] = useState(false);
  const [, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? "Something went wrong.");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Actions for ${klass.name}`}
            // Keep the click from following the surrounding class link.
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <MoreHorizontal className="size-3.5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <Pencil className="size-4" aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              run(
                () => archiveClassAction(klass.id, !klass.archivedAt),
                klass.archivedAt ? "Class unarchived." : "Class archived.",
              )
            }
          >
            {klass.archivedAt ? (
              <ArchiveRestore className="size-4" aria-hidden />
            ) : (
              <Archive className="size-4" aria-hidden />
            )}
            {klass.archivedAt ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              run(
                () => deleteClassAction(klass.id),
                "Class deleted. Its documents were kept.",
              )
            }
          >
            <Trash2 className="size-4" aria-hidden />
            Delete class
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename class"
        currentName={klass.name}
        onSubmit={async (name) => renameClassAction({ id: klass.id, name })}
      />
    </>
  );
}
