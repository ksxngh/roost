import { ModerationAction } from "@/generated/prisma/enums";
import { siteConfig } from "@/lib/site-config";
import { type Mailer, createMailer } from "@/server/mailer";
import { prisma } from "@/server/db";

/**
 * Tell a business the outcome of a moderation decision.
 *
 * Only the decisions a provider needs to hear about send mail: APPROVE (you're
 * live), REJECT (here's what to fix), and SUSPEND (you've been pulled, and
 * why). REINSTATE is folded into APPROVE's "you're live" message. A missing
 * business email is a no-op, never an error — the decision itself already
 * landed in the database.
 */
export async function sendModerationOutcome(
  input: {
    businessId: string;
    action: ModerationAction;
    note?: string | null;
  },
  deps: { mailer?: Mailer } = {},
): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { name: true, email: true, slug: true },
  });
  if (!business?.email) return;

  const message = bodyFor(input.action, business, input.note);
  if (!message) return;

  await (deps.mailer ?? createMailer()).send({
    to: business.email,
    subject: message.subject,
    text: [...message.lines, "", `— ${siteConfig.name}`].join("\n"),
  });
}

function bodyFor(
  action: ModerationAction,
  business: { name: string; slug: string },
  note?: string | null,
): { subject: string; lines: string[] } | null {
  const storefront = `${siteConfig.url}/pro/${business.slug}`;

  switch (action) {
    case ModerationAction.APPROVE:
    case ModerationAction.REINSTATE:
      return {
        subject: `${business.name} is live on ${siteConfig.name}`,
        lines: [
          `Good news — ${business.name} has been verified and is now listed`,
          `on the ${siteConfig.name} marketplace.`,
          "",
          `Your storefront: ${storefront}`,
        ],
      };
    case ModerationAction.REJECT:
      return {
        subject: `${business.name} needs another look before it can go live`,
        lines: [
          `We reviewed ${business.name} and can't publish it yet.`,
          ...(note ? ["", `Reason: ${note}`] : []),
          "",
          "Update your storefront and documents, then submit again from your",
          `dashboard: ${siteConfig.url}/storefront`,
        ],
      };
    case ModerationAction.SUSPEND:
      return {
        subject: `${business.name} has been suspended on ${siteConfig.name}`,
        lines: [
          `${business.name} has been removed from the marketplace and is no`,
          "longer bookable.",
          ...(note ? ["", `Reason: ${note}`] : []),
          "",
          "Reply to this email if you think this was a mistake.",
        ],
      };
    default:
      return null;
  }
}
