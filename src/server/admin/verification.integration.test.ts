// @vitest-environment node
/**
 * Integration tests for platform moderation. The properties that matter: only
 * an admin can decide, every decision is a valid transition, each one leaves
 * an attributable audit row, and the business's plan/verification state moves
 * exactly as the workflow allows.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  BusinessStatus,
  ModerationAction,
  PlatformRole,
} from "@/generated/prisma/enums";
import { meetsPlatformRole, requirePlatformRole } from "@/server/admin/access";
import {
  InvalidTransitionError,
  getReviewDetail,
  listReviewQueue,
  moderateBusiness,
} from "@/server/admin/verification";
import { ForbiddenError, NotFoundError } from "@/server/businesses/access";
import { createBusiness } from "@/server/businesses/businesses";
import { prisma } from "@/server/db";
import type { Mailer, MailMessage } from "@/server/mailer";

let seq = 0;

async function makeUser(platformRole: PlatformRole = PlatformRole.USER) {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: `u-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
      platformRole,
    },
  });
}

async function makeCategory() {
  seq += 1;
  return prisma.serviceCategory.create({
    data: { slug: `cat-${seq}`, name: `Cat ${seq}`, position: seq },
  });
}

/** A business in a given status, with a contact email for the mailer test. */
async function makeBusiness(status: BusinessStatus) {
  const [owner, category] = await Promise.all([makeUser(), makeCategory()]);
  const business = await createBusiness(owner.id, {
    name: `Biz ${seq}`,
    categoryIds: [category.id],
    serviceAreas: [{ city: "Surrey", region: "BC", country: "CA" }],
  });
  await prisma.business.update({
    where: { id: business.id },
    data: { status, email: `biz-${seq}@example.com` },
  });
  return { owner, business };
}

/** A mailer that records what it was asked to send. */
function recordingMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    async send(message) {
      sent.push(message);
    },
  };
  return { mailer, sent };
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.businessReview.deleteMany();
});

describe("platform access", () => {
  it("ranks admin above staff above user", () => {
    expect(meetsPlatformRole(PlatformRole.ADMIN, PlatformRole.STAFF)).toBe(true);
    expect(meetsPlatformRole(PlatformRole.STAFF, PlatformRole.ADMIN)).toBe(
      false,
    );
    expect(meetsPlatformRole(PlatformRole.USER, PlatformRole.STAFF)).toBe(false);
    expect(meetsPlatformRole(PlatformRole.STAFF, PlatformRole.STAFF)).toBe(true);
  });

  it("requirePlatformRole throws for an under-privileged user", async () => {
    const staff = await makeUser(PlatformRole.STAFF);
    await expect(
      requirePlatformRole(staff.id, PlatformRole.ADMIN, "moderate"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      requirePlatformRole(staff.id, PlatformRole.STAFF, "read"),
    ).resolves.toBe(PlatformRole.STAFF);
  });
});

describe("listReviewQueue", () => {
  it("shows only pending businesses, oldest first, to staff", async () => {
    const staff = await makeUser(PlatformRole.STAFF);
    const first = await makeBusiness(BusinessStatus.PENDING_REVIEW);
    const second = await makeBusiness(BusinessStatus.PENDING_REVIEW);
    await makeBusiness(BusinessStatus.ACTIVE); // excluded
    await makeBusiness(BusinessStatus.DRAFT); // excluded

    const queue = await listReviewQueue(staff.id);
    const ids = queue.map((item) => item.id);

    expect(ids).toContain(first.business.id);
    expect(ids).toContain(second.business.id);
    expect(
      queue.every((item) => item.id !== undefined),
    ).toBe(true);
    // Oldest submission first.
    expect(ids.indexOf(first.business.id)).toBeLessThan(
      ids.indexOf(second.business.id),
    );
  });

  it("refuses a plain user", async () => {
    const user = await makeUser();
    await expect(listReviewQueue(user.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("moderateBusiness", () => {
  it("approves a pending business, verifies it, and logs the decision", async () => {
    const admin = await makeUser(PlatformRole.ADMIN);
    const { business } = await makeBusiness(BusinessStatus.PENDING_REVIEW);
    const { mailer, sent } = recordingMailer();

    const result = await moderateBusiness(
      admin.id,
      business.id,
      ModerationAction.APPROVE,
      { deps: { mailer } },
    );

    expect(result.status).toBe(BusinessStatus.ACTIVE);

    const after = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
      select: { status: true, verifiedAt: true },
    });
    expect(after.status).toBe(BusinessStatus.ACTIVE);
    expect(after.verifiedAt).toBeInstanceOf(Date);

    const reviews = await prisma.businessReview.findMany({
      where: { businessId: business.id },
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      action: ModerationAction.APPROVE,
      fromStatus: BusinessStatus.PENDING_REVIEW,
      toStatus: BusinessStatus.ACTIVE,
      reviewerId: admin.id,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("is live");
  });

  it("rejects a pending business back to draft with the reason emailed", async () => {
    const admin = await makeUser(PlatformRole.ADMIN);
    const { business } = await makeBusiness(BusinessStatus.PENDING_REVIEW);
    const { mailer, sent } = recordingMailer();

    await moderateBusiness(admin.id, business.id, ModerationAction.REJECT, {
      note: "Insurance certificate has expired.",
      deps: { mailer },
    });

    const after = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
      select: { status: true, verifiedAt: true },
    });
    expect(after.status).toBe(BusinessStatus.DRAFT);
    expect(after.verifiedAt).toBeNull();
    expect(sent[0].text).toContain("Insurance certificate has expired.");
  });

  it("suspends an active business and reinstates it, keeping the original verifiedAt", async () => {
    const admin = await makeUser(PlatformRole.ADMIN);
    const { business } = await makeBusiness(BusinessStatus.PENDING_REVIEW);
    const { mailer } = recordingMailer();

    await moderateBusiness(admin.id, business.id, ModerationAction.APPROVE, {
      deps: { mailer },
    });
    const verifiedAt = (
      await prisma.business.findUniqueOrThrow({
        where: { id: business.id },
        select: { verifiedAt: true },
      })
    ).verifiedAt;

    await moderateBusiness(admin.id, business.id, ModerationAction.SUSPEND, {
      note: "Complaint under investigation.",
      deps: { mailer },
    });
    expect(
      (
        await prisma.business.findUniqueOrThrow({
          where: { id: business.id },
          select: { status: true },
        })
      ).status,
    ).toBe(BusinessStatus.SUSPENDED);

    await moderateBusiness(admin.id, business.id, ModerationAction.REINSTATE, {
      deps: { mailer },
    });
    const after = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
      select: { status: true, verifiedAt: true },
    });
    expect(after.status).toBe(BusinessStatus.ACTIVE);
    // Reinstatement does not re-stamp verification.
    expect(after.verifiedAt?.getTime()).toBe(verifiedAt?.getTime());

    const actions = (
      await prisma.businessReview.findMany({
        where: { businessId: business.id },
        orderBy: { createdAt: "asc" },
      })
    ).map((r) => r.action);
    expect(actions).toEqual([
      ModerationAction.APPROVE,
      ModerationAction.SUSPEND,
      ModerationAction.REINSTATE,
    ]);
  });

  it("refuses an invalid transition and writes nothing", async () => {
    const admin = await makeUser(PlatformRole.ADMIN);
    const { business } = await makeBusiness(BusinessStatus.ACTIVE);

    await expect(
      moderateBusiness(admin.id, business.id, ModerationAction.APPROVE),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    expect(
      await prisma.businessReview.count({ where: { businessId: business.id } }),
    ).toBe(0);
  });

  it("refuses a staff reviewer (read-only) and a plain user", async () => {
    const staff = await makeUser(PlatformRole.STAFF);
    const user = await makeUser();
    const { business } = await makeBusiness(BusinessStatus.PENDING_REVIEW);

    await expect(
      moderateBusiness(staff.id, business.id, ModerationAction.APPROVE),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      moderateBusiness(user.id, business.id, ModerationAction.APPROVE),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(
      await prisma.businessReview.count({ where: { businessId: business.id } }),
    ).toBe(0);
  });
});

describe("getReviewDetail", () => {
  it("returns documents and moderation history to staff", async () => {
    const admin = await makeUser(PlatformRole.ADMIN);
    const { business } = await makeBusiness(BusinessStatus.PENDING_REVIEW);
    await prisma.businessDocument.create({
      data: {
        businessId: business.id,
        kind: "LICENCE",
        title: "Licence.pdf",
        storageKey: `business/${business.id}/licence-${Date.now()}`,
        mimeType: "application/pdf",
        sizeBytes: 2048,
      },
    });
    await moderateBusiness(admin.id, business.id, ModerationAction.REJECT, {
      note: "Needs a current licence.",
    });

    const detail = await getReviewDetail(admin.id, business.id);
    expect(detail.documents).toHaveLength(1);
    expect(detail.documents[0].kind).toBe("LICENCE");
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]).toMatchObject({
      action: ModerationAction.REJECT,
      note: "Needs a current licence.",
      reviewer: admin.name,
    });
  });

  it("404s for an unknown business", async () => {
    const admin = await makeUser(PlatformRole.ADMIN);
    await expect(
      getReviewDetail(admin.id, "does-not-exist"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
