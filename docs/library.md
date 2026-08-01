# Library

The library is where students organize uploaded material. It is a server
component that composes client components for the interactive parts.

## Structure

```
/library                       All documents
/library?classId=…             One class
/library?classId=…&folderId=…  One folder inside a class
/library?favorite=1            Favorites
/library?archived=1            Archived
/library?deleted=1             Trash
/library?search=…              Title search (combines with the above)
```

Every view is a URL, so any filtered state is shareable, bookmarkable, and
survives a refresh. The page parses `searchParams` through
`documentFilterSchema`, so a malformed or hostile query string is rejected
before it reaches the database.

## Ownership model

**Every service function takes a `userId` and scopes its query by it.** This is
the security boundary, and it lives in `src/server/library/`, not in the UI —
a component that forgets a check cannot leak data, because the query itself
never matches another user's rows.

Attempting to touch someone else's record raises `NotFoundError`, which
surfaces as "That document does not exist." Existence is never confirmed to a
non-owner. The integration suite asserts this for every mutation.

## Mutations

Mutations are Next.js Server Actions in `src/server/library/actions.ts`. Each
one runs through a shared `mutation()` wrapper that:

1. requires a session,
2. runs the operation,
3. revalidates `/library`,
4. converts known domain errors (`NotFoundError`, `DuplicateNameError`,
   `InvalidMoveError`) into user-facing messages, and
5. logs anything else and returns a generic message, so internals never reach
   the client.

Actions return `{ ok: true }` or `{ ok: false, error }` rather than throwing,
which keeps error handling uniform in components.

## Processing status

Uploaded documents start `PENDING`. `useProcessingWatcher` polls
`/api/documents/status` every 2.5s **only while at least one document is
pending or processing**, and calls `router.refresh()` when one settles. An
idle library makes no requests at all.

The status badge is a live region, so screen-reader users hear a document
become ready without checking manually.

## Deletion model

Three distinct states, deliberately:

| Action         | Effect                                                    |
| -------------- | --------------------------------------------------------- |
| Archive        | Hidden from the default view, fully recoverable           |
| Move to trash  | Soft delete (`deletedAt`), restorable from the Trash view |
| Delete forever | Row removed and stored object deleted                     |

Deleting a **class or folder never deletes documents** — they are detached
(`onDelete: SetNull`). Tidying up the library cannot destroy uploads.

## Accessibility notes

- Class and folder links carry an explicit `aria-label` ("Biology, 3
  documents"). Without it the visible count concatenates onto the name and is
  announced as "Biology3".
- The document count is `aria-hidden` since it is already in the label.
- Every menu trigger names its subject ("Actions for Photosynthesis Notes"),
  so a screen-reader user knows which card a menu belongs to.
- Tests query by role and accessible name, so these properties are enforced
  rather than assumed.

## Known limitations

- **Folders are one level deep in the UI.** The schema supports nesting and
  `moveFolder` already rejects cycles (including moving a folder into its own
  descendant), with tests — but there is no breadcrumb navigation or
  folder-into-folder move UI yet, so `moveFolderAction` has no caller.
- **Search matches titles only.** Content search arrives in Milestone 4 as
  semantic retrieval over embeddings; building a second full-text index now
  would be throwaway work.
- Pagination is implemented in the service layer (cursor-based, tested) but
  the UI loads the first 50 documents without an infinite-scroll control.
