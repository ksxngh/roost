import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/marketing/site-footer";

describe("SiteFooter", () => {
  it("exposes the legal pages a marketplace must link", () => {
    render(<SiteFooter />);

    expect(
      screen.getByRole("link", { name: "Terms of Service" }),
    ).toHaveAttribute("href", "/legal/terms");
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/legal/privacy");
  });

  it("gives both audiences an entry point", () => {
    render(<SiteFooter />);
    expect(
      screen.getByRole("link", { name: "Browse services" }),
    ).toHaveAttribute("href", "/browse");
    expect(
      screen.getByRole("link", { name: "List your business" }),
    ).toHaveAttribute("href", "/signup");
  });

  it("labels its navigation landmark", () => {
    render(<SiteFooter />);
    expect(
      screen.getByRole("navigation", { name: "Footer" }),
    ).toBeInTheDocument();
  });
});
