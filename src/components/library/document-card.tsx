"use client";

import {
  Archive,
  ArchiveRestore,
  FileImage,
  FileInput as FolderInput,
  FileText,
  FileType,
  MoreVertical,
  Pencil,
  Presentation,
  Star,
  Tag as TagIcon,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DocumentStatusBadge } from "@/components/library/document-status-badge";
import { MoveDialog } from "@/components/library/move-dialog";
import { RenameDialog } from "@/components/library/rename-dialog";
import { TagPicker } from "@/components/library/tag-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentKind, DocumentStatus } from "@/generated/prisma/enums";
import { formatBytes, formatRelativeTime, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClassSummary } from "@/server/library/classes";
import type { DocumentListItem } from "@/server/library/documents";
import type { FolderSummary } from "@/server/library/folders";
import type { TagSummary } from "@/server/library/tags";
import {
  archiveDocumentAction,
  favoriteDocumentAction,
  purgeDocumentAction,
  renameDocumentAction,
  restoreDocumentAction,
  trashDocumentAction,
} from "@/server/library/actions";

const KIND_ICON = {
  [DocumentKind.PDF]: FileType,
  [DocumentKind.DOCX]: FileText,
  [DocumentKind.PPTX]: Presentation,
  [DocumentKind.TEXT]: FileText,
  [DocumentKind.MARKDOWN]: FileText,
  [DocumentKind.IMAGE]: FileImage,
} as const;

export function DocumentCard({
  document,
  view,
  classes = [],
  folders = [],
  tags = [],
}: {
  document: DocumentListItem;
  /** "trash" swaps the actions for restore/delete-forever. */
  view: "library" | "trash";
  classes?: ClassSummary[];
  folders?: FolderSummary[];
  tags?: TagSummary[];
}) {
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [tagging, setTagging] = useState(false);
  const Icon = KIND_ICON[document.kind];

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <>
      <Card
        className={cn(
          "group relative flex flex-col gap-3 p-4 transition-opacity",
          pending && "opacity-60",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium" title={document.title}>
              {document.title}
            </h3>
            <p className="text-muted-foreground truncate text-xs">
              {document.className ? `${document.className} · ` : ""}
              {formatBytes(document.sizeBytes)}
              {document.pageCount
                ? ` · ${pluralize(document.pageCount, "page")}`
                : ""}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={`Actions for ${document.title}`}
                disabled={pending}
              >
                <MoreVertical className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {view === "trash" ? (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      run(
                        () => restoreDocumentAction(document.id),
                        "Document restored.",
                      )
                    }
                  >
                    <Undo2 className="size-4" aria-hidden />
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      run(
                        () => purgeDocumentAction(document.id),
                        "Document permanently deleted.",
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Delete forever
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => setRenaming(true)}>
                    <Pencil className="size-4" aria-hidden />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMoving(true)}>
                    <FolderInput className="size-4" aria-hidden />
                    Move to…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTagging(true)}>
                    <TagIcon className="size-4" aria-hidden />
                    Tags
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      run(
                        () =>
                          favoriteDocumentAction(
                            document.id,
                            !document.favorite,
                          ),
                        document.favorite
                          ? "Removed from favorites."
                          : "Added to favorites.",
                      )
                    }
                  >
                    <Star className="size-4" aria-hidden />
                    {document.favorite ? "Unfavorite" : "Favorite"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      run(
                        () =>
                          archiveDocumentAction(
                            document.id,
                            !document.archivedAt,
                          ),
                        document.archivedAt ? "Unarchived." : "Archived.",
                      )
                    }
                  >
                    {document.archivedAt ? (
                      <ArchiveRestore className="size-4" aria-hidden />
                    ) : (
                      <Archive className="size-4" aria-hidden />
                    )}
                    {document.archivedAt ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      run(
                        () => trashDocumentAction(document.id),
                        "Moved to trash.",
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Move to trash
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-between gap-2">
          <DocumentStatusBadge status={document.status} />
          <span className="text-muted-foreground text-xs">
            {formatRelativeTime(new Date(document.createdAt))}
          </span>
        </div>

        {document.status === DocumentStatus.FAILED &&
        document.processingError ? (
          <p className="text-destructive bg-destructive/10 rounded-md px-2 py-1.5 text-xs">
            {document.processingError}
          </p>
        ) : null}

        {document.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {document.tags.map((tag) => (
              <li
                key={tag.id}
                className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs"
              >
                {tag.name}
              </li>
            ))}
          </ul>
        ) : null}

        {document.favorite ? (
          <Star
            className="text-warning absolute top-3 right-11 size-3.5 fill-current"
            aria-label="Favorite"
          />
        ) : null}
      </Card>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename document"
        currentName={document.title}
        onSubmit={async (name) =>
          renameDocumentAction({ id: document.id, name })
        }
      />

      <MoveDialog
        open={moving}
        onOpenChange={setMoving}
        documentId={document.id}
        documentTitle={document.title}
        currentClassId={document.classId}
        currentFolderId={document.folderId}
        classes={classes}
        folders={folders}
      />

      <TagPicker
        open={tagging}
        onOpenChange={setTagging}
        documentId={document.id}
        documentTitle={document.title}
        appliedTagIds={document.tags.map((tag) => tag.id)}
        tags={tags}
      />
    </>
  );
}
