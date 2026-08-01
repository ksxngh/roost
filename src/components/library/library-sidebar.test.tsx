import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LibrarySidebar } from "@/components/library/library-sidebar";
import type { ClassSummary } from "@/server/library/classes";

vi.mock("@/server/library/actions", () => ({
  createClassAction: vi.fn(async () => ({ ok: true as const })),
  renameClassAction: vi.fn(async () => ({ ok: true as const })),
  archiveClassAction: vi.fn(async () => ({ ok: true as const })),
  deleteClassAction: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const classes = [
  { id: "c1", name: "Biology", color: "chart-1", documentCount: 3 },
  { id: "c2", name: "Chemistry", color: "chart-2", documentCount: 1 },
] as ClassSummary[];

describe("LibrarySidebar", () => {
  it("renders the standard views", () => {
    render(<LibrarySidebar classes={[]} activeView="/library" />);
    for (const label of ["All documents", "Favorites", "Archived", "Trash"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the active view", () => {
    render(<LibrarySidebar classes={[]} activeView="/library?favorite=1" />);
    expect(screen.getByRole("link", { name: "Favorites" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not mark a view active while a class is selected", () => {
    render(
      <LibrarySidebar
        classes={classes}
        activeView="/library"
        activeClassId="c1"
      />,
    );
    expect(
      screen.getByRole("link", { name: "All documents" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("gives class links a meaningful accessible name including the count", () => {
    render(<LibrarySidebar classes={classes} activeView="/library" />);
    // The bare number alone would read as "Biology 3" with no unit.
    expect(
      screen.getByRole("link", { name: "Biology, 3 documents" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Chemistry, 1 document" }),
    ).toBeInTheDocument();
  });

  it("prompts to create a class when there are none", () => {
    render(<LibrarySidebar classes={[]} activeView="/library" />);
    expect(screen.getByText(/No classes yet/)).toBeInTheDocument();
  });

  it("exposes per-class actions", () => {
    render(<LibrarySidebar classes={classes} activeView="/library" />);
    expect(
      screen.getByRole("button", { name: "Actions for Biology" }),
    ).toBeInTheDocument();
  });
});
