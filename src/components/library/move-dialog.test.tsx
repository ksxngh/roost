import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MoveDialog } from "@/components/library/move-dialog";
import type { ClassSummary } from "@/server/library/classes";
import type { FolderSummary } from "@/server/library/folders";

const { moveDocumentAction } = vi.hoisted(() => ({
  moveDocumentAction: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/server/library/actions", () => ({ moveDocumentAction }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const classes = [
  { id: "c1", name: "Biology", color: "chart-1" },
  { id: "c2", name: "Chemistry", color: "chart-2" },
] as ClassSummary[];

const folders = [
  { id: "f1", name: "Week 1", classId: "c1" },
  { id: "f2", name: "Week 2", classId: "c2" },
  { id: "f3", name: "Loose", classId: null },
] as FolderSummary[];

function renderDialog(overrides: Record<string, unknown> = {}) {
  return render(
    <MoveDialog
      open
      onOpenChange={vi.fn()}
      documentId="doc_1"
      documentTitle="Photosynthesis Notes"
      currentClassId={null}
      currentFolderId={null}
      classes={classes}
      folders={folders}
      {...overrides}
    />,
  );
}

describe("MoveDialog", () => {
  it("shows the document being moved", () => {
    renderDialog();
    expect(screen.getByText("Photosynthesis Notes")).toBeInTheDocument();
  });

  it("offers every class plus a no-class option", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("combobox", { name: /Class/ }));
    expect(
      await screen.findByRole("option", { name: "Biology" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Chemistry" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "No class" }),
    ).toBeInTheDocument();
  });

  it("only offers folders belonging to the selected class", async () => {
    const user = userEvent.setup();
    renderDialog({ currentClassId: "c1" });

    await user.click(screen.getByRole("combobox", { name: /Folder/ }));
    expect(
      await screen.findByRole("option", { name: "Week 1" }),
    ).toBeInTheDocument();
    // Week 2 belongs to Chemistry and must not be selectable here.
    expect(
      screen.queryByRole("option", { name: "Week 2" }),
    ).not.toBeInTheDocument();
  });

  it("submits the chosen destination", async () => {
    const user = userEvent.setup();
    renderDialog({ currentClassId: "c1" });

    await user.click(screen.getByRole("button", { name: "Move" }));
    expect(moveDocumentAction).toHaveBeenCalledWith({
      id: "doc_1",
      classId: "c1",
      folderId: null,
    });
  });

  it("sends nulls when moving out of every class and folder", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Move" }));
    expect(moveDocumentAction).toHaveBeenCalledWith({
      id: "doc_1",
      classId: null,
      folderId: null,
    });
  });
});
