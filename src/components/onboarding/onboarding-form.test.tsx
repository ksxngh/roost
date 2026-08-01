import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";

const { mockCreate, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("@/server/businesses/actions", () => ({
  createBusinessAction: mockCreate,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const categories = [
  { id: "c1", slug: "plumbing", name: "Plumbing", description: null },
  { id: "c2", slug: "electrical", name: "Electrical", description: null },
];

/** Enough categories to exercise the ten-selection cap. */
const manyCategories = Array.from({ length: 12 }, (_, index) => ({
  id: `c${index}`,
  slug: `trade-${index}`,
  name: `Trade ${index}`,
  description: null,
}));

function submitButton() {
  return screen.getByRole("button", { name: "Create my business" });
}

async function addArea(user: ReturnType<typeof userEvent.setup>, city: string) {
  await user.type(screen.getByLabelText("City"), city);
  await user.type(screen.getByLabelText("Province"), "bc");
  await user.click(screen.getByRole("button", { name: "Add" }));
}

beforeEach(() => {
  mockCreate.mockReset();
  mockPush.mockReset();
  mockCreate.mockResolvedValue({ ok: true, data: { id: "b1", slug: "acme" } });
});

describe("OnboardingForm", () => {
  it("keeps submission disabled until name, service, and area are all set", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm categories={categories} />);

    expect(submitButton()).toBeDisabled();

    await user.type(screen.getByLabelText("Business name"), "Northside");
    expect(submitButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Plumbing/ }));
    expect(submitButton()).toBeDisabled();

    await addArea(user, "Surrey");
    expect(submitButton()).toBeEnabled();
  });

  it("submits normalised values", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm categories={categories} />);

    await user.type(screen.getByLabelText("Business name"), "  Northside  ");
    await user.click(screen.getByRole("button", { name: /Plumbing/ }));
    await addArea(user, "Surrey");
    await user.click(submitButton());

    expect(mockCreate).toHaveBeenCalledWith({
      name: "Northside",
      categoryIds: ["c1"],
      serviceAreas: [{ city: "Surrey", region: "BC", country: "CA" }],
    });
  });

  it("redirects to the storefront on success", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm categories={categories} />);

    await user.type(screen.getByLabelText("Business name"), "Northside");
    await user.click(screen.getByRole("button", { name: /Plumbing/ }));
    await addArea(user, "Surrey");
    await user.click(submitButton());

    expect(mockPush).toHaveBeenCalledWith("/storefront");
  });

  it("shows the server's error without navigating away", async () => {
    mockCreate.mockResolvedValue({
      ok: false,
      error: "You already have a business set up.",
    });
    const user = userEvent.setup();
    render(<OnboardingForm categories={categories} />);

    await user.type(screen.getByLabelText("Business name"), "Northside");
    await user.click(screen.getByRole("button", { name: /Plumbing/ }));
    await addArea(user, "Surrey");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You already have a business set up.",
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("toggles a category off when clicked twice", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm categories={categories} />);

    const plumbing = screen.getByRole("button", { name: /Plumbing/ });
    await user.click(plumbing);
    expect(plumbing).toHaveAttribute("aria-pressed", "true");
    await user.click(plumbing);
    expect(plumbing).toHaveAttribute("aria-pressed", "false");
  });

  it("stops at ten categories and disables the rest", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm categories={manyCategories} />);

    for (const category of manyCategories.slice(0, 10)) {
      await user.click(screen.getByRole("button", { name: category.name }));
    }

    expect(screen.getByText("10 of 10 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trade 10" })).toBeDisabled();
  });

  it("ignores a duplicate service area", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm categories={categories} />);

    await addArea(user, "Surrey");
    await addArea(user, "surrey");

    expect(
      screen.getAllByRole("button", { name: /^Remove Surrey/ }),
    ).toHaveLength(1);
  });

  it("removes a service area", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm categories={categories} />);

    await addArea(user, "Surrey");
    await user.click(screen.getByRole("button", { name: "Remove Surrey, BC" }));

    expect(
      screen.queryByRole("button", { name: "Remove Surrey, BC" }),
    ).not.toBeInTheDocument();
  });

  it("does not submit the whole form when adding an area", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm categories={categories} />);

    await user.type(screen.getByLabelText("Business name"), "Northside");
    await user.click(screen.getByRole("button", { name: /Plumbing/ }));
    await addArea(user, "Surrey");

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
