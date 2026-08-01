import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BookingSettingsForm } from "@/components/availability/booking-settings-form";
import {
  ClosuresEditor,
  type ClosureRow,
} from "@/components/availability/closures-editor";
import { HoursEditor } from "@/components/availability/hours-editor";
import { SlotPreview } from "@/components/availability/slot-preview";

const {
  mockSetHours,
  mockAddException,
  mockRemoveException,
  mockRefresh,
  mockReplace,
  mockToastError,
  mockUpdateSettings,
} = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn(),
  mockSetHours: vi.fn(),
  mockAddException: vi.fn(),
  mockRemoveException: vi.fn(),
  mockRefresh: vi.fn(),
  mockReplace: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/server/businesses/actions", () => ({
  setWeeklyHoursAction: mockSetHours,
  addExceptionAction: mockAddException,
  removeExceptionAction: mockRemoveException,
  updateBookingSettingsAction: mockUpdateSettings,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

const WEEKDAY_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSetHours.mockResolvedValue({ ok: true });
  mockAddException.mockResolvedValue({ ok: true });
  mockRemoveException.mockResolvedValue({ ok: true });
  mockUpdateSettings.mockResolvedValue({ ok: true });
});

describe("HoursEditor", () => {
  it("shows every day, closed by default", () => {
    render(<HoursEditor hours={[]} />);
    expect(screen.getAllByText("Closed")).toHaveLength(7);
  });

  it("prefills saved hours and marks those days open", () => {
    render(<HoursEditor hours={WEEKDAY_HOURS} />);
    expect(screen.getAllByText("Closed")).toHaveLength(2); // weekend
    expect(screen.getByLabelText("Monday opening time")).toHaveValue("540");
    expect(screen.getByLabelText("Monday closing time")).toHaveValue("1020");
  });

  it("sends only the open days", async () => {
    const user = userEvent.setup();
    render(<HoursEditor hours={WEEKDAY_HOURS} />);

    await user.click(screen.getByRole("button", { name: "Save hours" }));

    expect(mockSetHours).toHaveBeenCalledWith(WEEKDAY_HOURS);
  });

  it("sends an empty week when every day is closed", async () => {
    const user = userEvent.setup();
    render(<HoursEditor hours={[]} />);

    await user.click(screen.getByRole("button", { name: "Save hours" }));

    expect(mockSetHours).toHaveBeenCalledWith([]);
  });

  it("adds a day when it is switched on", async () => {
    const user = userEvent.setup();
    render(<HoursEditor hours={[]} />);

    await user.click(screen.getByLabelText("Saturday"));
    await user.click(screen.getByRole("button", { name: "Save hours" }));

    expect(mockSetHours).toHaveBeenCalledWith([
      { weekday: 6, startMinute: 9 * 60, endMinute: 17 * 60 },
    ]);
  });

  it("refuses to save a day that closes before it opens", async () => {
    const user = userEvent.setup();
    render(<HoursEditor hours={WEEKDAY_HOURS} />);

    await user.selectOptions(
      screen.getByLabelText("Monday closing time"),
      "480", // 8:00 AM, before the 9:00 AM open
    );
    await user.click(screen.getByRole("button", { name: "Save hours" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Monday/);
    expect(mockSetHours).not.toHaveBeenCalled();
  });

  it("copies Monday across the working week", async () => {
    const user = userEvent.setup();
    render(<HoursEditor hours={[]} />);

    await user.click(screen.getByLabelText("Monday"));
    await user.selectOptions(
      screen.getByLabelText("Monday opening time"),
      "420", // 7:00 AM
    );
    await user.click(
      screen.getByRole("button", { name: "Copy Monday to weekdays" }),
    );
    await user.click(screen.getByRole("button", { name: "Save hours" }));

    expect(mockSetHours).toHaveBeenCalledWith(
      [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        startMinute: 420,
        endMinute: 17 * 60,
      })),
    );
  });

  it("collapses a split shift into its outer bounds when saved", async () => {
    const user = userEvent.setup();
    render(
      <HoursEditor
        hours={[
          { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
          { weekday: 1, startMinute: 13 * 60, endMinute: 17 * 60 },
        ]}
      />,
    );

    expect(screen.getByLabelText("Monday opening time")).toHaveValue("480");
    expect(screen.getByLabelText("Monday closing time")).toHaveValue("1020");

    await user.click(screen.getByRole("button", { name: "Save hours" }));
    expect(mockSetHours).toHaveBeenCalledWith([
      { weekday: 1, startMinute: 480, endMinute: 1020 },
    ]);
  });

  it("surfaces a rejection from the server", async () => {
    mockSetHours.mockResolvedValue({ ok: false, error: "Windows overlap" });
    const user = userEvent.setup();
    render(<HoursEditor hours={WEEKDAY_HOURS} />);

    await user.click(screen.getByRole("button", { name: "Save hours" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Windows overlap",
    );
  });
});

describe("ClosuresEditor", () => {
  const closures: ClosureRow[] = [
    { id: "x1", date: "2026-12-25", note: "Christmas" },
  ];

  it("says so when nothing is scheduled", () => {
    render(<ClosuresEditor closures={[]} />);
    expect(screen.getByText("No days off scheduled.")).toBeInTheDocument();
  });

  it("lists a closure with its reason", () => {
    render(<ClosuresEditor closures={closures} />);
    expect(screen.getByText("2026-12-25")).toBeInTheDocument();
    expect(screen.getByText("Christmas")).toBeInTheDocument();
  });

  it("keeps Add disabled until a date is chosen", async () => {
    const user = userEvent.setup();
    render(<ClosuresEditor closures={[]} />);

    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();

    await user.type(screen.getByLabelText("Date"), "2026-07-01");
    expect(add).toBeEnabled();
  });

  it("submits the date and trimmed note", async () => {
    const user = userEvent.setup();
    render(<ClosuresEditor closures={[]} />);

    await user.type(screen.getByLabelText("Date"), "2026-07-01");
    await user.type(
      screen.getByLabelText("Reason (optional)"),
      "  Canada Day  ",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(mockAddException).toHaveBeenCalledWith({
      date: "2026-07-01",
      note: "Canada Day",
    });
  });

  it("sends null when no reason is given", async () => {
    const user = userEvent.setup();
    render(<ClosuresEditor closures={[]} />);

    await user.type(screen.getByLabelText("Date"), "2026-07-01");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(mockAddException).toHaveBeenCalledWith({
      date: "2026-07-01",
      note: null,
    });
  });

  it("removes a closure by id", async () => {
    const user = userEvent.setup();
    render(<ClosuresEditor closures={closures} />);

    await user.click(screen.getByRole("button", { name: "Reopen 2026-12-25" }));

    expect(mockRemoveException).toHaveBeenCalledWith("x1");
  });

  it("reports a failure instead of pretending it worked", async () => {
    mockAddException.mockResolvedValue({ ok: false, error: "Nope." });
    const user = userEvent.setup();
    render(<ClosuresEditor closures={[]} />);

    await user.type(screen.getByLabelText("Date"), "2026-07-01");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(mockToastError).toHaveBeenCalledWith("Nope.");
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("SlotPreview", () => {
  const days = [
    { date: "2026-08-03", weekday: 1, times: ["9:00 AM", "9:15 AM"] },
    { date: "2026-08-04", weekday: 2, times: [] },
  ];
  const packages = [
    { id: "p1", name: "Drain unclogging" },
    { id: "p2", name: "Tap replacement" },
  ];

  it("renders the times the server computed", () => {
    render(
      <SlotPreview
        days={days}
        packages={packages}
        selectedPackageId="p1"
        timezone="America/Vancouver"
        totalSlots={2}
      />,
    );
    expect(screen.getByText("9:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("names the timezone the times are in", () => {
    render(
      <SlotPreview
        days={days}
        packages={packages}
        selectedPackageId="p1"
        timezone="America/St_Johns"
        totalSlots={2}
      />,
    );
    expect(screen.getByText(/America\/St Johns/)).toBeInTheDocument();
  });

  it("explains an empty week rather than showing nothing", () => {
    render(
      <SlotPreview
        days={[]}
        packages={packages}
        selectedPackageId="p1"
        timezone="America/Vancouver"
        totalSlots={0}
      />,
    );
    expect(screen.getByText(/Nothing bookable/)).toBeInTheDocument();
  });

  it("asks for a service when there are none", () => {
    render(
      <SlotPreview
        days={[]}
        packages={[]}
        selectedPackageId={null}
        timezone="America/Vancouver"
        totalSlots={0}
      />,
    );
    expect(screen.getByText(/Add a service/)).toBeInTheDocument();
  });

  it("switches service through the URL so the server recomputes", async () => {
    const user = userEvent.setup();
    render(
      <SlotPreview
        days={days}
        packages={packages}
        selectedPackageId="p1"
        timezone="America/Vancouver"
        totalSlots={2}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Service"), "p2");

    expect(mockReplace).toHaveBeenCalledWith("/availability?package=p2");
  });

  it("hides the picker when there is only one service", () => {
    render(
      <SlotPreview
        days={days}
        packages={[packages[0]!]}
        selectedPackageId="p1"
        timezone="America/Vancouver"
        totalSlots={2}
      />,
    );
    expect(screen.queryByLabelText("Service")).not.toBeInTheDocument();
  });
});

describe("BookingSettingsForm", () => {
  const settings = {
    timezone: "America/Vancouver",
    bookingLeadHours: 24,
    bookingHorizonDays: 30,
  };

  it("shows the saved settings", () => {
    render(<BookingSettingsForm settings={settings} />);
    expect(screen.getByLabelText("Timezone")).toHaveTextContent("Vancouver");
    expect(screen.getByLabelText("Notice needed")).toHaveTextContent("1 day");
    expect(screen.getByLabelText("Book up to")).toHaveTextContent("30 days");
  });

  it("saves the settings unchanged when nothing is edited", async () => {
    const user = userEvent.setup();
    render(<BookingSettingsForm settings={settings} />);

    await user.click(
      screen.getByRole("button", { name: /Save booking rules/ }),
    );

    expect(mockUpdateSettings).toHaveBeenCalledWith(settings);
  });

  it("keeps a timezone that is not in the shortlist", () => {
    render(
      <BookingSettingsForm
        settings={{ ...settings, timezone: "Europe/Lisbon" }}
      />,
    );
    expect(screen.getByLabelText("Timezone")).toHaveTextContent("Lisbon");
  });

  it("surfaces a rejected timezone", async () => {
    mockUpdateSettings.mockResolvedValue({
      ok: false,
      error: "Choose a valid timezone",
    });
    const user = userEvent.setup();
    render(<BookingSettingsForm settings={settings} />);

    await user.click(
      screen.getByRole("button", { name: /Save booking rules/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a valid timezone",
    );
  });
});
