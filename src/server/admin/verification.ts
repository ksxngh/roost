import {
  BusinessStatus,
  ModerationAction,
  PlatformRole,
} from "@/generated/prisma/enums";
import { NotFoundError } from "@/server/businesses/access";
import { requirePlatformRole } from "@/server/admin/access";
import { sendModerationOutcome } from "@/server/notifications/moderation-mail";
import { type Mailer } from "@/server/mailer";
import { prisma } from "@/server/db";

/** Raised when an action does not apply to the business's current status. */
export class InvalidTransitionError extends Error {
  constructor(action: ModerationAction, from: BusinessStatus) {
    super(`Cannot ${action.toLowerCase()} a business that is ${from}.`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * The one status each action may act from, and the status it produces. Keeping
 * transitions in a table means a decision can never move a business somewhere
 * the workflow does not allow — e.g. approving an already-ACTIVE business, or
 * suspending one still in review.
 */
const TRANSITIONS: Record<
  ModerationAction,
  { from: BusinessStatus; to: BusinessStatus }
> = {
  [ModerationAction.APPROVE]: {
    from: BusinessStatus.PENDING_REVIEW,
    to: BusinessStatus.ACTIVE,
  },
  [ModerationAction.REJECT]: {
    from: BusinessStatus.PENDING_REVIEW,
    to: BusinessStatus.DRAFT,
  },
  [ModerationAction.SUSPEND]: {
    from: BusinessStatus.ACTIVE,
    to: BusinessStatus.SUSPENDED,
  },
  [ModerationAction.REINSTATE]: {
    from: BusinessStatus.SUSPENDED,
    to: BusinessStatus.ACTIVE,
  },
};

export type ReviewQueueItem = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  submittedAt: Date;
  documentCount: number;
};

/** Businesses awaiting a decision, oldest first (first-come, first-served). */
export async function listReviewQueue(
  userId: string,
): Promise<ReviewQueueItem[]> {
  await requirePlatformRole(
    userId,
    PlatformRole.STAFF,
    "view the review queue",
  );

  const businesses = await prisma.business.findMany({
    where: { status: BusinessStatus.PENDING_REVIEW },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      updatedAt: true,
      _count: { select: { documents: true } },
    },
  });

  return businesses.map((business) => ({
    id: business.id,
    name: business.name,
    slug: business.slug,
    email: business.email,
    submittedAt: business.updatedAt,
    documentCount: business._count.documents,
  }));
}

export type ReviewDetail = {
  id: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  email: string | null;
  phone: string | null;
  website: string | null;
  about: string | null;
  insuredUntil: Date | null;
  documents: {
    id: string;
    kind: string;
    status: string;
    reviewNote: string | null;
    expiresAt: Date | null;
  }[];
  history: {
    action: ModerationAction;
    note: string | null;
    reviewer: string | null;
    createdAt: Date;
  }[];
};

/** Full detail for one business, including its documents and moderation log. */
export async function getReviewDetail(
  userId: string,
  businessId: string,
): Promise<ReviewDetail> {
  await requirePlatformRole(userId, PlatformRole.STAFF, "view this business");

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      email: true,
      phone: true,
      website: true,
      about: true,
      insuredUntil: true,
      documents: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          status: true,
          reviewNote: true,
          expiresAt: true,
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          note: true,
          createdAt: true,
          reviewer: { select: { name: true } },
        },
      },
    },
  });
  if (!business) throw new NotFoundError();

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    status: business.status,
    email: business.email,
    phone: business.phone,
    website: business.website,
    about: business.about,
    insuredUntil: business.insuredUntil,
    documents: business.documents,
    history: business.reviews.map((review) => ({
      action: review.action,
      note: review.note,
      reviewer: review.reviewer?.name ?? null,
      createdAt: review.createdAt,
    })),
  };
}

/**
 * Record a moderation decision.
 *
 * ADMIN-only (STAFF may read the queue but not decide). The status change, the
 * `verifiedAt` stamp on approval, and the append-only audit row are written in
 * one transaction, guarded by the current status so two admins acting at once
 * cannot double-apply. The outcome email is sent only after the transaction
 * commits — a mail failure must not roll back a real decision.
 */
export async function moderateBusiness(
  userId: string,
  businessId: string,
  action: ModerationAction,
  options: { note?: string | null; deps?: { mailer?: Mailer } } = {},
): Promise<{ status: BusinessStatus }> {
  await requirePlatformRole(userId, PlatformRole.ADMIN, "moderate businesses");

  const transition = TRANSITIONS[action];
  const note = options.note?.trim() || null;

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({
      where: { id: businessId },
      select: { status: true },
    });
    if (!business) throw new NotFoundError();
    if (business.status !== transition.from) {
      throw new InvalidTransitionError(action, business.status);
    }

    await tx.business.update({
      where: { id: businessId },
      data: {
        status: transition.to,
        // Stamp the first verification; leave it on later suspend/reinstate so
        // the original verification date is preserved.
        ...(action === ModerationAction.APPROVE
          ? { verifiedAt: new Date() }
          : {}),
      },
    });

    await tx.businessReview.create({
      data: {
        businessId,
        reviewerId: userId,
        action,
        fromStatus: transition.from,
        toStatus: transition.to,
        note,
      },
    });

    return { status: transition.to };
  });

  await sendModerationOutcome({ businessId, action, note }, options.deps ?? {});

  return result;
}
