import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SidebarNav } from "@/components/shell/sidebar-nav";
import { appNav } from "@/lib/site-config";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(() => "/dashboard"),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

describe("SidebarNav", () => {
  it("renders a link for every nav item inside a labeled nav landmark", () => {
    render(<SidebarNav items={appNav} />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeInTheDocument();
    for (const item of appNav) {
      const link = screen.getByRole("link", { name: item.title });
      expect(link).toHaveAttribute("href", item.href);
    }
  });

  it("marks only the active section with aria-current", () => {
    mockUsePathname.mockReturnValue("/library");
    render(<SidebarNav items={appNav} />);
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the section active on nested routes", () => {
    mockUsePathname.mockReturnValue("/library/folders/abc-123");
    render(<SidebarNav items={appNav} />);
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks nothing active on an unknown route", () => {
    mockUsePathname.mockReturnValue("/nowhere");
    render(<SidebarNav items={appNav} />);
    for (const item of appNav) {
      expect(
        screen.getByRole("link", { name: item.title }),
      ).not.toHaveAttribute("aria-current");
    }
  });

  it("invokes onNavigate when a link is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SidebarNav items={appNav} onNavigate={onNavigate} />);
    await user.click(screen.getByRole("link", { name: "Quizzes" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("renders nothing but the landmark for an empty item list", () => {
    render(<SidebarNav items={[]} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
