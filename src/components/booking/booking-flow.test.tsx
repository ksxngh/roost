import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BookingFlow,
  type BookableDay,
  type BookableService,
} from "@/components/booking/booking-flow";

const { mockCreate, mockPush } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("@/server/businesses/booking-actions", () => ({
  createBookingAction: mockCreate,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const service: BookableService = {
  id: "pkg_1",
  name: "Drain unclogging",
  description: "Kitchen and bathroom drains.",
  pricingModel: "FIXED",
  priceCents: 12_000,
  durationMinutes: 60,
};

const days: BookableDay[] = [
  {
    date: "2026-08-03",
    weekday: 1,
    slots: [
      { iso: "2026-08-03T16:00:00.000Z", label: "9:00 AM" },
      { iso: "2026-08-03T16:15:00.000Z", label: "9:15 AM" },
    ],
  },
  { date: "2026-08-04", weekday: 2, slots: [] },
];

function renderFlow(
  overrides: Partial<Parameters<typeof BookingFlow>[0]> = {},
) {
  return render(
    <BookingFlow
      slug="northside-plumbing"
      businessName="Northside Plumbing"
      timezone="America/Vancouver"
      service={service}
      days={days}
      {...overrides}
    />,
  );
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Your name"), "Dana Reyes");
  await user.type(screen.getByLabelText("Phone"), "604-555-0188");
  await user.type(screen.getByLabelText("Email"), "dana@example.com");
  await user.type(screen.getByLabelText("Street address"), "12 Elm St");
  await user.type(screen.getByLabelText("City"), "Surrey");
  await user.type(screen.getByLabelText("Province"), "BC");
  await user.type(screen.getByLabelText("Postal code"), "V3S 1A1");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ ok: true, data: { reference: "ABCD1234" } });
});

describe("BookingFlow", () => {
  it("shows the service, its price, and its length", () => {
    renderFlow();
    expect(screen.getByText("Drain unclogging")).toBeInTheDocument();
    expect(screen.getByText(/\$120/)).toBeInTheDocument();
    expect(screen.getByText("1 hr")).toBeInTheDocument();
  });

  it("names the timezone the times are in", () => {
    renderFlow();
    expect(screen.getByText(/America\/Vancouver/)).toBeInTheDocument();
  });

  it("offers only days that have slots", () => {
    renderFlow();
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.queryByText("Tuesday")).not.toBeInTheDocument();
  });

  it("says so when nothing is bookable", () => {
    renderFlow({ days: [{ date: "2026-08-04", weekday: 2, slots: [] }] });
    expect(screen.getByText(/No times available/)).toBeInTheDocument();
  });

  it("moves to the details step once a time is picked", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "9:00 AM" }));

    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByText(/2026-08-03 at 9:00 AM/)).toBeInTheDocument();
  });

  it("can go back and pick a different time", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "9:00 AM" }));
    await user.click(screen.getByRole("button", { name: "change time" }));

    expect(screen.getByRole("button", { name: "9:15 AM" })).toBeInTheDocument();
  });

  it("submits the chosen slot and trimmed details", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "9:15 AM" }));
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Request booking" }));

    expect(mockCreate).toHaveBeenCalledWith("northside-plumbing", {
      packageId: "pkg_1",
      startAt: "2026-08-03T16:15:00.000Z",
      customerName: "Dana Reyes",
      customerEmail: "dana@example.com",
      customerPhone: "604-555-0188",
      addressLine1: "12 Elm St",
      addressLine2: null,
      city: "Surrey",
      region: "BC",
      postalCode: "V3S 1A1",
      notes: null,
    });
  });

  it("sends the optional fields when they are filled in", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "9:00 AM" }));
    await fillDetails(user);
    await user.type(screen.getByLabelText(/Unit or buzzer/), "Unit 3");
    await user.type(
      screen.getByLabelText(/Anything they should know/),
      "Gate code 4417",
    );
    await user.click(screen.getByRole("button", { name: "Request booking" }));

    expect(mockCreate).toHaveBeenCalledWith(
      "northside-plumbing",
      expect.objectContaining({
        addressLine2: "Unit 3",
        notes: "Gate code 4417",
      }),
    );
  });

  it("redirects to the booking reference on success", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "9:00 AM" }));
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Request booking" }));

    expect(mockPush).toHaveBeenCalledWith("/booking/ABCD1234");
  });

  it("shows a taken slot as an error and stays on the form", async () => {
    mockCreate.mockResolvedValue({
      ok: false,
      error: "That time was just taken. Please pick another.",
    });
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "9:00 AM" }));
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Request booking" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That time was just taken",
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your name")).toHaveValue("Dana Reyes");
  });

  it("tells the customer their address is shared with the business", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "9:00 AM" }));

    expect(
      screen.getByText(/shared with Northside Plumbing/),
    ).toBeInTheDocument();
  });

  it("describes quote-priced work without a number", () => {
    renderFlow({
      service: { ...service, pricingModel: "QUOTE", priceCents: null },
    });
    expect(screen.getByText(/Quoted on site/)).toBeInTheDocument();
  });

  it("marks an hourly rate as per hour", () => {
    renderFlow({ service: { ...service, pricingModel: "HOURLY" } });
    expect(screen.getByText(/\$120 \/ hr/)).toBeInTheDocument();
  });
});
