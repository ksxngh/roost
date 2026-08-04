import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BookingList,
  type ScheduleBooking,
} from "@/components/schedule/booking-list";

const {
  mockConfirm,
  mockDecline,
  mockCancel,
  mockComplete,
  mockRefresh,
  mockToastError,
} = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockDecline: vi.fn(),
  mockCancel: vi.fn(),
  mockComplete: vi.fn(),
  mockRefresh: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/server/businesses/booking-actions", () => ({
  confirmBookingAction: mockConfirm,
  declineBookingAction: mockDecline,
  cancelBookingAction: mockCancel,
  completeBookingAction: mockComplete,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

const pending: ScheduleBooking = {
  id: "bk_1",
  reference: "ABCD1234",
  packageName: "Drain unclogging",
  pricingModel: "FIXED",
  priceCents: 12_000,
  durationMinutes: 60,
  when: "Monday, August 3, 2026 at 9:00 AM",
  status: "PENDING",
  customerName: "Dana Reyes",
  customerPhone: "604-555-0188",
  customerEmail: "dana@example.com",
  address: "12 Elm St, Surrey, BC V3S 1A1",
  notes: "Gate code 4417",
  payment: null,
  assignedToId: null,
  internalNote: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of [mockConfirm, mockDecline, mockCancel, mockComplete]) {
    mock.mockResolvedValue({ ok: true });
  }
});

describe("BookingList", () => {
  it("shows the empty message when there is nothing", () => {
    render(<BookingList bookings={[]} emptyMessage="Nothing waiting." />);
    expect(screen.getByText("Nothing waiting.")).toBeInTheDocument();
  });

  it("shows what the provider needs to turn up", () => {
    render(<BookingList bookings={[pending]} emptyMessage="none" />);

    expect(screen.getByText("Drain unclogging")).toBeInTheDocument();
    expect(
      screen.getByText("Monday, August 3, 2026 at 9:00 AM"),
    ).toBeInTheDocument();
    expect(screen.getByText("Dana Reyes")).toBeInTheDocument();
    expect(
      screen.getByText("12 Elm St, Surrey, BC V3S 1A1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Gate code 4417")).toBeInTheDocument();
    expect(screen.getByText("ABCD1234")).toBeInTheDocument();
  });

  it("makes the customer's phone number dialable", () => {
    render(<BookingList bookings={[pending]} emptyMessage="none" />);
    expect(screen.getByRole("link", { name: "604-555-0188" })).toHaveAttribute(
      "href",
      "tel:6045550188",
    );
  });

  it("offers accept and decline on a pending booking", () => {
    render(<BookingList bookings={[pending]} emptyMessage="none" />);
    expect(screen.getByRole("button", { name: /Accept/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Decline/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Mark complete/ }),
    ).not.toBeInTheDocument();
  });

  it("offers complete and cancel on a confirmed booking", () => {
    render(
      <BookingList
        bookings={[{ ...pending, status: "CONFIRMED" }]}
        emptyMessage="none"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Mark complete/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Accept/ }),
    ).not.toBeInTheDocument();
  });

  it.each(["DECLINED", "CANCELLED", "COMPLETED"] as const)(
    "offers no actions on a %s booking",
    (status) => {
      render(
        <BookingList bookings={[{ ...pending, status }]} emptyMessage="none" />,
      );
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    },
  );

  it("confirms by id and refreshes", async () => {
    const user = userEvent.setup();
    render(<BookingList bookings={[pending]} emptyMessage="none" />);

    await user.click(screen.getByRole("button", { name: /Accept/ }));

    expect(mockConfirm).toHaveBeenCalledWith("bk_1");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("declines by id", async () => {
    const user = userEvent.setup();
    render(<BookingList bookings={[pending]} emptyMessage="none" />);

    await user.click(screen.getByRole("button", { name: /Decline/ }));

    expect(mockDecline).toHaveBeenCalledWith("bk_1");
  });

  it("completes a confirmed booking", async () => {
    const user = userEvent.setup();
    render(
      <BookingList
        bookings={[{ ...pending, status: "CONFIRMED" }]}
        emptyMessage="none"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Mark complete/ }));

    expect(mockComplete).toHaveBeenCalledWith("bk_1");
  });

  it("reports a rejected transition instead of refreshing", async () => {
    mockConfirm.mockResolvedValue({
      ok: false,
      error: "A cancelled booking cannot become confirmed.",
    });
    const user = userEvent.setup();
    render(<BookingList bookings={[pending]} emptyMessage="none" />);

    await user.click(screen.getByRole("button", { name: /Accept/ }));

    expect(mockToastError).toHaveBeenCalledWith(
      "A cancelled booking cannot become confirmed.",
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("describes quote-priced work without a number", () => {
    render(
      <BookingList
        bookings={[{ ...pending, pricingModel: "QUOTE", priceCents: null }]}
        emptyMessage="none"
      />,
    );
    expect(screen.getByText(/Quote on site/)).toBeInTheDocument();
  });
});
