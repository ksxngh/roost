import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlanComparison } from "@/components/pricing/plan-comparison";
import { PLANS, PLAN_FEATURES } from "@/lib/plans";

function rowFor(label: string) {
  const header = screen.getByRole("rowheader", { name: new RegExp(label) });
  return header.closest("tr")!;
}

describe("PlanComparison", () => {
  it("renders a real table so screen readers can pair row and column", () => {
    render(<PlanComparison />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    for (const plan of PLANS) {
      expect(
        screen.getByRole("columnheader", { name: plan.name }),
      ).toBeInTheDocument();
    }
  });

  it("shows every feature", () => {
    render(<PlanComparison />);
    expect(screen.getAllByRole("rowheader")).toHaveLength(PLAN_FEATURES.length);
  });

  it("puts the headline rows first", () => {
    render(<PlanComparison />);
    const firstRow = screen.getAllByRole("rowheader")[0]!;
    const firstHeadline = PLAN_FEATURES.find((feature) => feature.headline)!;
    expect(firstRow).toHaveTextContent(firstHeadline.label);
  });

  it("announces an excluded feature rather than showing a bare dash", () => {
    render(<PlanComparison />);
    const row = rowFor("Granular permissions per teammate");
    expect(within(row).getByText("Not included")).toBeInTheDocument();
  });

  it("announces an included feature", () => {
    render(<PlanComparison />);
    const row = rowFor("Public storefront");
    expect(within(row).getAllByText("Included").length).toBeGreaterThan(0);
  });

  it("marks unbuilt capability Soon instead of ticking it", () => {
    render(<PlanComparison />);
    const row = rowFor("Invite employees");

    expect(within(row).getAllByText("Soon").length).toBeGreaterThan(0);
    expect(within(row).queryByText("Included")).not.toBeInTheDocument();
  });

  it("ticks a capability once it ships", () => {
    render(<PlanComparison />);
    const row = rowFor("Client list and job history");

    expect(within(row).getAllByText("Included").length).toBe(2);
    expect(within(row).queryByText("Soon")).not.toBeInTheDocument();
  });

  it("shows seat counts as text rather than a tick", () => {
    render(<PlanComparison />);
    const row = rowFor("Team seats");

    expect(within(row).getByText("1 seat (solo)")).toBeInTheDocument();
    expect(within(row).getByText("Up to 8 seats")).toBeInTheDocument();
  });

  it("distinguishes the support tiers", () => {
    render(<PlanComparison />);
    const row = rowFor("Support");

    expect(within(row).getByText("Standard support")).toBeInTheDocument();
    expect(within(row).getByText("Dedicated support")).toBeInTheDocument();
  });

  it("gives Premium the guaranteed-bookings row and Pro nothing", () => {
    render(<PlanComparison />);
    const row = rowFor("Guaranteed bookings");

    expect(within(row).getByText("Not included")).toBeInTheDocument();
    expect(within(row).getByText("Soon")).toBeInTheDocument();
  });
});
