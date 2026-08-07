import { describe, expect, it } from "vitest";

import {
  CAPABILITY_LABELS,
  MEMBER_CAPABILITIES,
  inviteMemberSchema,
  updateMemberSchema,
} from "@/lib/validations/team";

describe("inviteMemberSchema", () => {
  it("accepts a member invite with capabilities", () => {
    const parsed = inviteMemberSchema.parse({
      email: "a@example.com",
      role: "MEMBER",
      capabilities: ["SCHEDULE", "BILLING"],
    });
    expect(parsed.capabilities).toEqual(["SCHEDULE", "BILLING"]);
  });

  it("defaults capabilities to an empty list", () => {
    const parsed = inviteMemberSchema.parse({
      email: "a@example.com",
      role: "ADMIN",
    });
    expect(parsed.capabilities).toEqual([]);
  });

  it("de-duplicates capabilities", () => {
    const parsed = inviteMemberSchema.parse({
      email: "a@example.com",
      role: "MEMBER",
      capabilities: ["SCHEDULE", "SCHEDULE", "CLIENTS"],
    });
    expect(parsed.capabilities).toEqual(["SCHEDULE", "CLIENTS"]);
  });

  it("rejects a malformed email", () => {
    expect(
      inviteMemberSchema.safeParse({ email: "nope", role: "MEMBER" }).success,
    ).toBe(false);
  });

  it("rejects OWNER as an invitable role", () => {
    expect(
      inviteMemberSchema.safeParse({ email: "a@example.com", role: "OWNER" })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown capability", () => {
    expect(
      inviteMemberSchema.safeParse({
        email: "a@example.com",
        role: "MEMBER",
        capabilities: ["EVERYTHING"],
      }).success,
    ).toBe(false);
  });
});

describe("updateMemberSchema", () => {
  it("allows a capability-only change", () => {
    expect(updateMemberSchema.parse({ capabilities: ["BILLING"] })).toEqual({
      capabilities: ["BILLING"],
    });
  });

  it("allows a role-only change", () => {
    expect(updateMemberSchema.parse({ role: "ADMIN" })).toEqual({
      role: "ADMIN",
    });
  });

  it("rejects promoting to OWNER", () => {
    expect(updateMemberSchema.safeParse({ role: "OWNER" }).success).toBe(false);
  });
});

describe("capability labels", () => {
  it("labels every capability the enum defines", () => {
    for (const capability of MEMBER_CAPABILITIES) {
      expect(CAPABILITY_LABELS[capability]).toBeDefined();
      expect(CAPABILITY_LABELS[capability].title).toBeTruthy();
    }
  });
});
