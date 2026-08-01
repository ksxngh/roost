import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileForm } from "@/components/storefront/profile-form";
import { ServiceAreaEditor } from "@/components/storefront/service-area-editor";
import { SubmitForReview } from "@/components/storefront/submit-for-review";

const {
  mockUpdateProfile,
  mockAddArea,
  mockRemoveArea,
  mockSubmit,
  mockToastError,
} = vi.hoisted(() => ({
  mockUpdateProfile: vi.fn(),
  mockAddArea: vi.fn(),
  mockRemoveArea: vi.fn(),
  mockSubmit: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/server/businesses/actions", () => ({
  updateProfileAction: mockUpdateProfile,
  addServiceAreaAction: mockAddArea,
  removeServiceAreaAction: mockRemoveArea,
  submitForReviewAction: mockSubmit,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

const business = {
  name: "Northside Plumbing",
  tagline: null,
  about: null,
  phone: null,
  email: null,
  website: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateProfile.mockResolvedValue({ ok: true });
  mockAddArea.mockResolvedValue({ ok: true });
  mockRemoveArea.mockResolvedValue({ ok: true });
  mockSubmit.mockResolvedValue({ ok: true });
});

describe("ProfileForm", () => {
  it("prefills the existing profile", () => {
    render(
      <ProfileForm business={{ ...business, tagline: "Same-day repairs" }} />,
    );
    expect(screen.getByLabelText("Business name")).toHaveValue(
      "Northside Plumbing",
    );
    expect(screen.getByLabelText("Tagline")).toHaveValue("Same-day repairs");
  });

  it("renders null fields as empty rather than the string 'null'", () => {
    render(<ProfileForm business={business} />);
    expect(screen.getByLabelText("About")).toHaveValue("");
    expect(screen.getByLabelText("Website")).toHaveValue("");
  });

  it("trims values and sends null for fields left blank", async () => {
    const user = userEvent.setup();
    render(<ProfileForm business={business} />);

    await user.type(screen.getByLabelText("Tagline"), "  Same-day repairs  ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(mockUpdateProfile).toHaveBeenCalledWith({
      name: "Northside Plumbing",
      tagline: "Same-day repairs",
      about: null,
      phone: null,
      email: null,
      website: null,
    });
  });

  it("shows a validation error returned by the server", async () => {
    mockUpdateProfile.mockResolvedValue({
      ok: false,
      error: "Enter a valid email address",
    });
    const user = userEvent.setup();
    render(<ProfileForm business={business} />);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid email address",
    );
  });
});

describe("ServiceAreaEditor", () => {
  const areas = [{ id: "a1", city: "Surrey", region: "BC" }];

  it("prompts when no area is set", () => {
    render(<ServiceAreaEditor areas={[]} />);
    expect(screen.getByText(/nobody can find you/i)).toBeInTheDocument();
  });

  it("uppercases the province and defaults the country", async () => {
    const user = userEvent.setup();
    render(<ServiceAreaEditor areas={areas} />);

    await user.type(screen.getByLabelText("City"), "Langley");
    await user.type(screen.getByLabelText("Province"), "bc");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(mockAddArea).toHaveBeenCalledWith({
      city: "Langley",
      region: "BC",
      country: "CA",
    });
  });

  it("keeps Add disabled until both fields are filled", async () => {
    const user = userEvent.setup();
    render(<ServiceAreaEditor areas={areas} />);

    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();

    await user.type(screen.getByLabelText("City"), "Langley");
    expect(add).toBeDisabled();

    await user.type(screen.getByLabelText("Province"), "BC");
    expect(add).toBeEnabled();
  });

  it("removes an area by id", async () => {
    const user = userEvent.setup();
    render(<ServiceAreaEditor areas={areas} />);

    await user.click(screen.getByRole("button", { name: "Remove Surrey, BC" }));

    expect(mockRemoveArea).toHaveBeenCalledWith("a1");
  });

  it("surfaces a failed removal", async () => {
    mockRemoveArea.mockResolvedValue({ ok: false, error: "Not allowed." });
    const user = userEvent.setup();
    render(<ServiceAreaEditor areas={areas} />);

    await user.click(screen.getByRole("button", { name: "Remove Surrey, BC" }));

    expect(mockToastError).toHaveBeenCalledWith("Not allowed.");
  });
});

describe("SubmitForReview", () => {
  it("is disabled while the checklist is incomplete", () => {
    render(<SubmitForReview disabled />);
    expect(
      screen.getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
  });

  it("submits when the checklist is complete", async () => {
    const user = userEvent.setup();
    render(<SubmitForReview disabled={false} />);

    await user.click(screen.getByRole("button", { name: "Submit for review" }));

    expect(mockSubmit).toHaveBeenCalledOnce();
  });

  it("reports the reason a submission was rejected", async () => {
    mockSubmit.mockResolvedValue({
      ok: false,
      error: "Still needed before review: Upload proof of insurance.",
    });
    const user = userEvent.setup();
    render(<SubmitForReview disabled={false} />);

    await user.click(screen.getByRole("button", { name: "Submit for review" }));

    expect(mockToastError).toHaveBeenCalledWith(
      "Still needed before review: Upload proof of insurance.",
    );
  });
});
