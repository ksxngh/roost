import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DocumentCard } from "@/components/library/document-card";
import { DocumentKind, DocumentStatus } from "@/generated/prisma/enums";
import type { DocumentListItem } from "@/server/library/documents";

const actions = vi.hoisted(() => ({
  archiveDocumentAction: vi.fn(async () => ({ ok: true as const })),
  favoriteDocumentAction: vi.fn(async () => ({ ok: true as const })),
  purgeDocumentAction: vi.fn(async () => ({ ok: true as const })),
  renameDocumentAction: vi.fn(async () => ({ ok: true as const })),
  restoreDocumentAction: vi.fn(async () => ({ ok: true as const })),
  trashDocumentAction: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/server/library/actions", () => actions);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function buildDocument(
  overrides: Partial<DocumentListItem> = {},
): DocumentListItem {
  return {
    id: "doc_1",
    title: "Photosynthesis Notes",
    kind: DocumentKind.PDF,
    status: DocumentStatus.READY,
    sizeBytes: 2048,
    pageCount: 12,
    wordCount: 3400,
    processingError: null,
    favorite: false,
    archivedAt: null,
    createdAt: new Date(),
    classId: null,
    folderId: null,
    className: "Biology 101",
    tags: [],
    ...overrides,
  };
}

describe("DocumentCard", () => {
  it("shows title, class, size, and page count", () => {
    render(<DocumentCard document={buildDocument()} view="library" />);

    expect(
      screen.getByRole("heading", { name: "Photosynthesis Notes" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Biology 101/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
    expect(screen.getByText(/12 pages/)).toBeInTheDocument();
  });

  it("uses the singular for a one-page document", () => {
    render(
      <DocumentCard
        document={buildDocument({ pageCount: 1 })}
        view="library"
      />,
    );
    expect(screen.getByText(/1 page(?!s)/)).toBeInTheDocument();
  });

  it("omits the page count while a document is still processing", () => {
    render(
      <DocumentCard
        document={buildDocument({
          status: DocumentStatus.PENDING,
          pageCount: null,
        })}
        view="library"
      />,
    );
    expect(screen.queryByText(/page/)).not.toBeInTheDocument();
  });

  it("shows the failure reason when processing failed", () => {
    render(
      <DocumentCard
        document={buildDocument({
          status: DocumentStatus.FAILED,
          processingError: "No selectable text found.",
        })}
        view="library"
      />,
    );
    expect(screen.getByText("No selectable text found.")).toBeInTheDocument();
  });

  it("hides the error block for healthy documents", () => {
    render(<DocumentCard document={buildDocument()} view="library" />);
    expect(screen.queryByText(/No selectable text/)).not.toBeInTheDocument();
  });

  it("renders tags", () => {
    render(
      <DocumentCard
        document={buildDocument({
          tags: [{ id: "t1", name: "midterm", color: "chart-2" }],
        })}
        view="library"
      />,
    );
    expect(screen.getByText("midterm")).toBeInTheDocument();
  });

  it("marks favorites", () => {
    render(
      <DocumentCard
        document={buildDocument({ favorite: true })}
        view="library"
      />,
    );
    expect(screen.getByLabelText("Favorite")).toBeInTheDocument();
  });

  it("offers library actions and triggers favorite", async () => {
    const user = userEvent.setup();
    render(<DocumentCard document={buildDocument()} view="library" />);

    await user.click(
      screen.getByRole("button", {
        name: "Actions for Photosynthesis Notes",
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: /Favorite/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /Favorite/ }));
    expect(actions.favoriteDocumentAction).toHaveBeenCalledWith("doc_1", true);
  });

  it("offers restore and permanent delete in the trash view", async () => {
    const user = userEvent.setup();
    render(<DocumentCard document={buildDocument()} view="trash" />);

    await user.click(
      screen.getByRole("button", {
        name: "Actions for Photosynthesis Notes",
      }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Restore" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete forever" }),
    ).toBeInTheDocument();
    // Destructive library actions must not be reachable from the trash view.
    expect(
      screen.queryByRole("menuitem", { name: "Move to trash" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(actions.restoreDocumentAction).toHaveBeenCalledWith("doc_1");
  });
});
