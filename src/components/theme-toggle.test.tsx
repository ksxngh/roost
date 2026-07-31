import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/components/theme-toggle";

const { mockSetTheme } = vi.hoisted(() => ({ mockSetTheme: vi.fn() }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: mockSetTheme, theme: "dark" }),
}));

describe("ThemeToggle", () => {
  it("exposes an accessible trigger", async () => {
    render(<ThemeToggle />);
    expect(
      await screen.findByRole("button", { name: "Toggle theme" }),
    ).toBeInTheDocument();
  });

  it("offers light, dark, and system options and applies the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      await screen.findByRole("button", { name: "Toggle theme" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Light" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Dark" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "System" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Light" }));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });
});
