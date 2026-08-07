import { z } from "zod";

/** The capabilities a MEMBER can be granted. Mirrors the Prisma enum. */
export const MEMBER_CAPABILITIES = [
  "SCHEDULE",
  "BILLING",
  "CLIENTS",
  "STOREFRONT",
] as const;

/** Human labels for the capability grid. */
export const CAPABILITY_LABELS: Record<
  (typeof MEMBER_CAPABILITIES)[number],
  { title: string; description: string }
> = {
  SCHEDULE: {
    title: "Schedule",
    description: "Accept, decline, assign, and complete jobs.",
  },
  BILLING: {
    title: "Quotes & invoices",
    description: "Write, send, and manage quotes and invoices.",
  },
  CLIENTS: {
    title: "Clients",
    description: "Edit client notes and archive clients.",
  },
  STOREFRONT: {
    title: "Storefront",
    description: "Change services, hours, availability, and the storefront.",
  },
};

const capabilities = z
  .array(z.enum(MEMBER_CAPABILITIES))
  // Duplicates would inflate a stored array meaninglessly.
  .transform((values) => [...new Set(values)]);

/** Only MEMBER and ADMIN are invitable — the owner is not a role you assign. */
const assignableRole = z.enum(["ADMIN", "MEMBER"]);

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  role: assignableRole,
  capabilities: capabilities.default([]),
});

export const updateMemberSchema = z.object({
  role: assignableRole.optional(),
  capabilities: capabilities.optional(),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
