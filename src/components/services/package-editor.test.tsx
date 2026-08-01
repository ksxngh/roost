import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PackageEditor,
  type PackageRow,
} from "@/components/services/package-editor";

const { mockCreate, mockUpdate, mockDelete, mockRefresh, mockToastError } =
  vi.hoisted(() => ({
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockRefresh: vi.fn(),
    mockToastError: vi.fn(),
  }));

vi.mock("@/server/businesses/actions", () => ({
  createPackageAction: mockCreate,
  updatePackageAction: mockUpdate,
  deletePackageAction: mockDelete,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

const fixedPackage: PackageRow = {
  id: "p1",
  name: "Drain unclogging",
  description: "Kitchen and bathroom drains.",
  categoryId: null,
  pricingModel: "FIXED",
  priceCents: 12_000,
  durationMinutes: 60,
  bufferMinutes: 0,
  active: true,
};

const categories = [{ id: "c1", name: "Plumbing" }];

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ ok: true, data: { id: "new" } });
  mockUpdate.mockResolvedValue({ ok: true });
  mockDelete.mockResolvedValue({ ok: true });
});

describe("PackageEditor", () => {
  it("prompts when nothing is offered yet", () => {
    render(<PackageEditor packages={[]} categories={categories} />);
    expect(screen.getByText(/No services yet/)).toBeInTheDocument();
  });

  it("summarises price and duration", () => {
    render(<PackageEditor packages={[fixedPackage]} categories={categories} />);
    expect(screen.getByText(/\$120 · 1 hr/)).toBeInTheDocument();
  });

  it("shows the buffer when there is one", () => {
    render(
      <PackageEditor
        packages={[{ ...fixedPackage, bufferMinutes: 30 }]}
        categories={categories}
      />,
    );
    expect(screen.getByText(/\+ 30 min buffer/)).toBeInTheDocument();
  });

  it("marks a hidden service rather than dropping it from the list", () => {
    render(
      <PackageEditor
        packages={[{ ...fixedPackage, active: false }]}
        categories={categories}
      />,
    );
    expect(screen.getByText("Drain unclogging")).toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();
  });

  it("describes quote pricing without a number", () => {
    render(
      <PackageEditor
        packages={[
          { ...fixedPackage, pricingModel: "QUOTE", priceCents: null },
        ]}
        categories={categories}
      />,
    );
    expect(screen.getByText(/Quoted after a visit/)).toBeInTheDocument();
  });

  it("marks an hourly rate as per hour", () => {
    render(
      <PackageEditor
        packages={[{ ...fixedPackage, pricingModel: "HOURLY" }]}
        categories={categories}
      />,
    );
    expect(screen.getByText(/\$120 \/ hr/)).toBeInTheDocument();
  });

  it("converts dollars to cents on save", async () => {
    const user = userEvent.setup();
    render(<PackageEditor packages={[]} categories={categories} />);

    await user.click(screen.getByRole("button", { name: /Add service/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Tap replacement");
    await user.type(within(dialog).getByLabelText("Price"), "89.99");
    await user.click(
      within(dialog).getByRole("button", { name: /Save service/ }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Tap replacement", priceCents: 8999 }),
    );
  });

  it("rounds a price rather than truncating it", async () => {
    const user = userEvent.setup();
    render(<PackageEditor packages={[]} categories={categories} />);

    await user.click(screen.getByRole("button", { name: /Add service/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Odd price");
    await user.type(within(dialog).getByLabelText("Price"), "19.999");
    await user.click(
      within(dialog).getByRole("button", { name: /Save service/ }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ priceCents: 2000 }),
    );
  });

  it("prefills the dialog when editing", async () => {
    const user = userEvent.setup();
    render(<PackageEditor packages={[fixedPackage]} categories={categories} />);

    await user.click(
      screen.getByRole("button", { name: "Edit Drain unclogging" }),
    );
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByLabelText("Name")).toHaveValue(
      "Drain unclogging",
    );
    expect(within(dialog).getByLabelText("Price")).toHaveValue("120.00");
  });

  it("updates rather than creating when a package is being edited", async () => {
    const user = userEvent.setup();
    render(<PackageEditor packages={[fixedPackage]} categories={categories} />);

    await user.click(
      screen.getByRole("button", { name: "Edit Drain unclogging" }),
    );
    await user.click(screen.getByRole("button", { name: /Save service/ }));

    expect(mockUpdate).toHaveBeenCalledWith("p1", expect.any(Object));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sends no price for quote-priced work", async () => {
    const user = userEvent.setup();
    render(
      <PackageEditor
        packages={[
          { ...fixedPackage, pricingModel: "QUOTE", priceCents: null },
        ]}
        categories={categories}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Drain unclogging" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Price")).toBeDisabled();

    await user.click(
      within(dialog).getByRole("button", { name: /Save service/ }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ priceCents: null }),
    );
  });

  it("shows the server's error and keeps the dialog open", async () => {
    mockCreate.mockResolvedValue({ ok: false, error: "Enter a price" });
    const user = userEvent.setup();
    render(<PackageEditor packages={[]} categories={categories} />);

    await user.click(screen.getByRole("button", { name: /Add service/ }));
    await user.click(screen.getByRole("button", { name: /Save service/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a price");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("deletes by id", async () => {
    const user = userEvent.setup();
    render(<PackageEditor packages={[fixedPackage]} categories={categories} />);

    await user.click(
      screen.getByRole("button", { name: "Remove Drain unclogging" }),
    );

    expect(mockDelete).toHaveBeenCalledWith("p1");
  });

  it("reports a failed delete", async () => {
    mockDelete.mockResolvedValue({ ok: false, error: "Not allowed." });
    const user = userEvent.setup();
    render(<PackageEditor packages={[fixedPackage]} categories={categories} />);

    await user.click(
      screen.getByRole("button", { name: "Remove Drain unclogging" }),
    );

    expect(mockToastError).toHaveBeenCalledWith("Not allowed.");
  });
});
