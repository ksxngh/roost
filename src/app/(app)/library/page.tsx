import type { Metadata } from "next";

import { DocumentGrid } from "@/components/library/document-grid";
import { FolderList } from "@/components/library/folder-list";
import { LibrarySearch } from "@/components/library/library-search";
import { LibrarySidebar } from "@/components/library/library-sidebar";
import { UploadDropzone } from "@/components/library/upload-dropzone";
import { PageHeader } from "@/components/page-header";
import { documentFilterSchema } from "@/lib/validations/library";
import { listClasses } from "@/server/library/classes";
import { listDocuments } from "@/server/library/documents";
import { listFolders } from "@/server/library/folders";
import { listTags } from "@/server/library/tags";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Library" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user } = await requireSession();
  const params = await searchParams;

  const filter = documentFilterSchema.parse({
    search: single(params.search),
    classId: single(params.classId),
    folderId: single(params.folderId),
    tagId: single(params.tagId),
    favorite: single(params.favorite) === "1" || undefined,
    archived: single(params.archived) === "1",
    deleted: single(params.deleted) === "1",
  });

  const [classes, documents, folders, tags] = await Promise.all([
    listClasses(user.id),
    listDocuments(user.id, filter),
    // Folders at the current level: inside the selected class, or the root.
    listFolders(user.id, { classId: filter.classId ?? null, parentId: null }),
    listTags(user.id),
  ]);

  const activeClass = filter.classId
    ? classes.find((klass) => klass.id === filter.classId)
    : undefined;

  const view = viewFor(filter);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title={activeClass?.name ?? view.title}
        description={view.description}
      />

      <div className="flex flex-col gap-8 md:flex-row">
        <LibrarySidebar
          classes={classes}
          activeView={view.href}
          activeClassId={filter.classId}
        />

        <div className="min-w-0 flex-1 space-y-6">
          <LibrarySearch initialValue={filter.search ?? ""} />

          {!filter.deleted && !filter.archived ? (
            <>
              <FolderList
                folders={folders}
                classId={filter.classId ?? null}
                activeFolderId={filter.folderId}
              />
              <UploadDropzone
                classId={filter.classId ?? null}
                folderId={filter.folderId ?? null}
              />
            </>
          ) : null}

          <DocumentGrid
            documents={documents.items}
            view={filter.deleted ? "trash" : "library"}
            emptyTitle={filter.search ? "No matches" : view.emptyTitle}
            emptyDescription={
              filter.search
                ? `Nothing matches "${filter.search}". Try a different search.`
                : view.emptyDescription
            }
            classes={classes}
            folders={folders}
            tags={tags}
          />
        </div>
      </div>
    </div>
  );
}

/** Copy and empty states for the current filter combination. */
function viewFor(filter: {
  favorite?: boolean;
  archived: boolean;
  deleted: boolean;
}) {
  if (filter.deleted) {
    return {
      href: "/library?deleted=1",
      title: "Trash",
      description: "Deleted documents can be restored until they are purged.",
      emptyTitle: "Trash is empty",
      emptyDescription: "Documents you delete will appear here first.",
    };
  }
  if (filter.archived) {
    return {
      href: "/library?archived=1",
      title: "Archived",
      description: "Material you have set aside but want to keep.",
      emptyTitle: "Nothing archived",
      emptyDescription:
        "Archive documents you are done with to keep your library focused.",
    };
  }
  if (filter.favorite) {
    return {
      href: "/library?favorite=1",
      title: "Favorites",
      description: "The material you return to most.",
      emptyTitle: "No favorites yet",
      emptyDescription: "Star a document to pin it here for quick access.",
    };
  }
  return {
    href: "/library",
    title: "Library",
    description:
      "Upload PDFs, slides, notes, or images and StudyForge turns them into study material.",
    emptyTitle: "No material yet",
    emptyDescription:
      "Drop a file above to get started — it will be read automatically and made ready to study.",
  };
}
