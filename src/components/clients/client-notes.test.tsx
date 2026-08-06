import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClientNotes } from "@/components/clients/client-notes";

const { mockSetNotes, mockSetArchived, mockRefresh, mockToastError } =
  vi.hoisted(() => ({
    mockSetNotes: vi.fn(),
    mockSetArchived: vi.fn(),
    mockRefresh: vi.fn(),
    mockToastError: vi.fn(),
  }));

vi.mock("@/server/businesses/client-actions", () => ({
  setClientNotesAction: mockSetNotes,
  setClientArchivedAction: mockSetArchived,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSetNotes.mockResolvedValue({ ok: true });
  mockSetArchived.mockResolvedValue({ ok: true });
});

describe("ClientNotes", () => {
  it("prefills the existing note", () => {
    render(
      <ClientNotes clientId="c1" notes="Dog in the yard" archived={false} />,
    );
    expect(screen.getByLabelText("Private notes")).toHaveValue(
      "Dog in the yard",
    );
  });

  it("renders a null note as empty rather than the string null", () => {
    render(<ClientNotes clientId="c1" notes={null} archived={false} />);
    expect(screen.getByLabelText("Private notes")).toHaveValue("");
  });

  it("says the note is private to the team", () => {
    render(<ClientNotes clientId="c1" notes={null} archived={false} />);
    expect(screen.getByText(/Only your team sees this/)).toBeInTheDocument();
  });

  it("saves what was typed", async () => {
    const user = userEvent.setup();
    render(<ClientNotes clientId="c1" notes={null} archived={false} />);

    await user.type(screen.getByLabelText("Private notes"), "Side gate sticks");
    await user.click(screen.getByRole("button", { name: "Save notes" }));

    expect(mockSetNotes).toHaveBeenCalledWith("c1", "Side gate sticks");
  });

  it("shows a rejection instead of claiming success", async () => {
    mockSetNotes.mockResolvedValue({
      ok: false,
      error: "Keep notes under 2000 characters.",
    });
    const user = userEvent.setup();
    render(<ClientNotes clientId="c1" notes={null} archived={false} />);

    await user.click(screen.getByRole("button", { name: "Save notes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Keep notes under 2000 characters.",
    );
  });

  it("archives an active client", async () => {
    const user = userEvent.setup();
    render(<ClientNotes clientId="c1" notes={null} archived={false} />);

    await user.click(screen.getByRole("button", { name: "Archive client" }));

    expect(mockSetArchived).toHaveBeenCalledWith("c1", true);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("restores an archived one", async () => {
    const user = userEvent.setup();
    render(<ClientNotes clientId="c1" notes={null} archived />);

    await user.click(screen.getByRole("button", { name: "Restore client" }));

    expect(mockSetArchived).toHaveBeenCalledWith("c1", false);
  });

  it("reports a failed archive", async () => {
    mockSetArchived.mockResolvedValue({ ok: false, error: "Not allowed." });
    const user = userEvent.setup();
    render(<ClientNotes clientId="c1" notes={null} archived={false} />);

    await user.click(screen.getByRole("button", { name: "Archive client" }));

    expect(mockToastError).toHaveBeenCalledWith("Not allowed.");
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
