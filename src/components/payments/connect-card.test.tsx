import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConnectCard,
  type ConnectView,
} from "@/components/payments/connect-card";

const { mockStart, mockRefresh, mockRouterRefresh } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockRefresh: vi.fn(),
  mockRouterRefresh: vi.fn(),
}));

vi.mock("@/server/payments/actions", () => ({
  startStripeOnboardingAction: mockStart,
  refreshStripeStatusAction: mockRefresh,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const disconnected: ConnectView = {
  connected: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
};

const active: ConnectView = {
  connected: true,
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
};

function renderCard(
  overrides: Partial<Parameters<typeof ConnectCard>[0]> = {},
) {
  return render(
    <ConnectCard
      status={disconnected}
      configured
      feePercent="10%"
      isOwner
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStart.mockResolvedValue({
    ok: true,
    data: { url: "https://stripe.test/x" },
  });
  mockRefresh.mockResolvedValue({ ok: true, data: active });
  // jsdom refuses real navigation, so the assign call is observed instead.
  vi.stubGlobal("location", { assign: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ConnectCard", () => {
  it("states the platform fee up front", () => {
    renderCard();
    expect(screen.getByText(/Roost keeps 10% of each job/)).toBeInTheDocument();
  });

  it("invites a disconnected business to connect", () => {
    renderCard();
    expect(
      screen.getByRole("button", { name: /Connect Stripe/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Refresh status/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the checklist once connected", () => {
    renderCard({ status: active });
    expect(screen.getByText("Can accept payments")).toBeInTheDocument();
    expect(screen.getByText("Can receive payouts")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("marks a half-finished account incomplete and says so", () => {
    renderCard({
      status: {
        connected: true,
        detailsSubmitted: true,
        chargesEnabled: false,
        payoutsEnabled: false,
      },
    });
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
    expect(
      screen.getByText(/still needs something from you/),
    ).toBeInTheDocument();
  });

  it("navigates to the Stripe URL the server returned", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /Connect Stripe/ }));

    expect(window.location.assign).toHaveBeenCalledWith(
      "https://stripe.test/x",
    );
  });

  it("shows an error instead of navigating when Stripe is unreachable", async () => {
    mockStart.mockResolvedValue({
      ok: false,
      error: "Could not reach Stripe. Please try again.",
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /Connect Stripe/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach Stripe",
    );
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("refreshes the status from Stripe", async () => {
    const user = userEvent.setup();
    renderCard({ status: active });

    await user.click(screen.getByRole("button", { name: /Refresh status/ }));

    expect(mockRefresh).toHaveBeenCalled();
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it("explains that bookings still work when payments are switched off", () => {
    renderCard({ configured: false });
    expect(screen.getByText(/Bookings still work/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Connect Stripe/ }),
    ).not.toBeInTheDocument();
  });

  it("hides the controls from a non-owner and says why", () => {
    renderCard({ isOwner: false });
    expect(
      screen.getByText(/Only the business owner can change payout settings/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Connect Stripe/ }),
    ).not.toBeInTheDocument();
  });
});
