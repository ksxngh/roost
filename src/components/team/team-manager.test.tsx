import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  TeamManager,
  type PendingInvite,
  type TeamMember,
} from "@/components/team/team-manager";

const { mockInvite, mockRemove, mockRevoke, mockUpdate, mockRefresh } =
  vi.hoisted(() => ({
    mockInvite: vi.fn(),
    mockRemove: vi.fn(),
    mockRevoke: vi.fn(),
    mockUpdate: vi.fn(),
    mockRefresh: vi.fn(),
  }));

vi.mock("@/server/businesses/team-actions", () => ({
  inviteMemberAction: mockInvite,
  removeMemberAction: mockRemove,
  revokeInvitationAction: mockRevoke,
  updateMemberAction: mockUpdate,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const owner: TeamMember = {
  id: "m-owner",
  name: "Sam Owner",
  email: "sam@example.com",
  role: "OWNER",
  capabilities: [],
  isSelf: true,
};

const member: TeamMember = {
  id: "m-1",
  name: "Dana Tech",
  email: "dana@example.com",
  role: "MEMBER",
  capabilities: ["SCHEDULE"],
  isSelf: false,
};

function renderTeam(
  overrides: Partial<Parameters<typeof TeamManager>[0]> = {},
) {
  return render(
    <TeamManager
      members={[owner, member]}
      invitations={[]}
      seatsInUse={2}
      seatLimit={8}
      canManage
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInvite.mockResolvedValue({ ok: true });
  mockRemove.mockResolvedValue({ ok: true });
  mockRevoke.mockResolvedValue({ ok: true });
  mockUpdate.mockResolvedValue({ ok: true });
});

describe("TeamManager", () => {
  it("shows seats in use", () => {
    renderTeam();
    expect(screen.getByText("2 of 8 seats in use.")).toBeInTheDocument();
    expect(screen.getByText("6 seats available.")).toBeInTheDocument();
  });

  it("invites a member with chosen capabilities", async () => {
    const user = userEvent.setup();
    renderTeam();

    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.click(screen.getByLabelText(/Quotes & invoices/));
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));

    expect(mockInvite).toHaveBeenCalledWith({
      email: "new@example.com",
      role: "MEMBER",
      capabilities: ["BILLING"],
    });
  });

  it("does not offer a capability grid for an admin invite", async () => {
    const user = userEvent.setup();
    renderTeam();

    // The capability grid is present for the default MEMBER role…
    expect(screen.getByText(/What can they do\?/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Role"));
    await user.click(screen.getByRole("option", { name: "Admin" }));

    expect(screen.queryByText(/What can they do\?/)).not.toBeInTheDocument();
  });

  it("disables inviting when every seat is taken", () => {
    renderTeam({ seatsInUse: 1, seatLimit: 1 });
    expect(screen.getByText(/single seat/)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeDisabled();
  });

  it("does not let you remove yourself or the owner", () => {
    renderTeam();
    expect(
      screen.queryByRole("button", { name: "Remove Sam Owner" }),
    ).not.toBeInTheDocument();
  });

  it("removes a manageable member", async () => {
    const user = userEvent.setup();
    renderTeam();

    await user.click(screen.getByRole("button", { name: "Remove Dana Tech" }));

    expect(mockRemove).toHaveBeenCalledWith("m-1");
  });

  it("toggles a member capability", async () => {
    const user = userEvent.setup();
    renderTeam();

    // Dana has SCHEDULE granted; the member row shows togglable pills. Grant
    // BILLING via its pill.
    const danaRow = screen.getByText("Dana Tech").closest("li")!;
    await user.click(
      within(danaRow).getByRole("button", { name: "Quotes & invoices" }),
    );

    expect(mockUpdate).toHaveBeenCalledWith("m-1", {
      capabilities: ["SCHEDULE", "BILLING"],
    });
  });

  it("revokes a pending invitation", async () => {
    const invite: PendingInvite = {
      id: "inv-1",
      email: "pending@example.com",
      role: "MEMBER",
      expiresAt: "2027-01-01T00:00:00.000Z",
    };
    const user = userEvent.setup();
    renderTeam({ invitations: [invite] });

    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(mockRevoke).toHaveBeenCalledWith("inv-1");
  });

  it("hides all controls from a member who cannot manage", () => {
    renderTeam({ canManage: false });
    expect(
      screen.queryByRole("button", { name: /Send invitation/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Dana Tech" }),
    ).not.toBeInTheDocument();
  });
});
