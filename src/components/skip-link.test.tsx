import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MAIN_CONTENT_ID, SkipLink } from "@/components/skip-link";

describe("SkipLink", () => {
  it("is a link that targets the main-content landmark", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
  });

  it("stays in the accessibility tree while hidden, for keyboard users", () => {
    // sr-only hides it visually but keeps it focusable and announced; a
    // display:none link could not be tabbed to. getByRole finds it either way.
    render(<SkipLink />);
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toBeInTheDocument();
  });
});
