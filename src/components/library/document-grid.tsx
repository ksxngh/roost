"use client";

import { FileQuestion } from "lucide-react";

import { DocumentCard } from "@/components/library/document-card";
import { EmptyState } from "@/components/empty-state";
import { useProcessingWatcher } from "@/hooks/use-processing-watcher";
import type { ClassSummary } from "@/server/library/classes";
import type { DocumentListItem } from "@/server/library/documents";
import type { FolderSummary } from "@/server/library/folders";
import type { TagSummary } from "@/server/library/tags";

export function DocumentGrid({
  documents,
  view,
  emptyTitle,
  emptyDescription,
  classes,
  folders,
  tags,
}: {
  documents: DocumentListItem[];
  view: "library" | "trash";
  emptyTitle: string;
  emptyDescription: string;
  classes: ClassSummary[];
  folders: FolderSummary[];
  tags: TagSummary[];
}) {
  // Refreshes the page when a queued or processing document settles.
  useProcessingWatcher(documents);

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {documents.map((document) => (
        <li key={document.id}>
          <DocumentCard
            document={document}
            view={view}
            classes={classes}
            folders={folders}
            tags={tags}
          />
        </li>
      ))}
    </ul>
  );
}
