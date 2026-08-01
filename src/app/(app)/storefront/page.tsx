import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { DocumentManager } from "@/components/storefront/document-manager";
import { ProfileForm } from "@/components/storefront/profile-form";
import { ServiceAreaEditor } from "@/components/storefront/service-area-editor";
import { SubmitForReview } from "@/components/storefront/submit-for-review";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { currentMembership } from "@/server/businesses/access";
import {
  getBusiness,
  storefrontReadiness,
} from "@/server/businesses/businesses";
import {
  ACCEPT_ATTRIBUTE,
  listBusinessDocuments,
} from "@/server/businesses/documents";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Storefront" };

const STATUS_COPY = {
  DRAFT: {
    label: "Draft",
    description: "Not visible to customers yet.",
    variant: "secondary" as const,
  },
  PENDING_REVIEW: {
    label: "In review",
    description: "We're checking your licence and insurance.",
    variant: "secondary" as const,
  },
  ACTIVE: {
    label: "Live",
    description: "Customers can find and book you.",
    variant: "default" as const,
  },
  SUSPENDED: {
    label: "Suspended",
    description: "Hidden from the marketplace. Contact support.",
    variant: "destructive" as const,
  },
};

export default async function StorefrontPage() {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const [business, readiness, documents] = await Promise.all([
    getBusiness(user.id, membership.businessId),
    storefrontReadiness(user.id, membership.businessId),
    listBusinessDocuments(user.id, membership.businessId),
  ]);

  const status = STATUS_COPY[business.status];
  const remaining = readiness.filter((check) => !check.done).length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Storefront"
        description="How your business appears to customers browsing the marketplace."
        actions={
          business.status === "ACTIVE" ? (
            <Link
              href={`/pro/${business.slug}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
            >
              View public page
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {business.name}
            <Badge variant={status.variant}>{status.label}</Badge>
          </CardTitle>
          <CardDescription>{status.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Public address:{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
              /pro/{business.slug}
            </code>
          </p>

          {business.status === "DRAFT" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {remaining === 0
                  ? "Everything's ready — submit for review."
                  : `${remaining} step${remaining === 1 ? "" : "s"} before you can go live`}
              </p>
              <ul className="space-y-2">
                {readiness.map((check) => (
                  <li
                    key={check.key}
                    className="flex items-center gap-2 text-sm"
                  >
                    {check.done ? (
                      <CheckCircle2
                        className="text-success size-4 shrink-0"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        className="text-muted-foreground size-4 shrink-0"
                        aria-hidden
                      />
                    )}
                    <span
                      className={
                        check.done ? "text-muted-foreground line-through" : ""
                      }
                    >
                      {check.label}
                    </span>
                  </li>
                ))}
              </ul>
              <SubmitForReview disabled={remaining > 0} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ProfileForm
        business={{
          name: business.name,
          tagline: business.tagline,
          about: business.about,
          phone: business.phone,
          email: business.email,
          website: business.website,
        }}
      />

      <ServiceAreaEditor
        areas={business.serviceAreas.map((area) => ({
          id: area.id,
          city: area.city,
          region: area.region,
        }))}
      />

      <DocumentManager
        accept={ACCEPT_ATTRIBUTE}
        documents={documents.map((document) => ({
          id: document.id,
          kind: document.kind,
          title: document.title,
          sizeBytes: document.sizeBytes,
          status: document.status,
          expiresAt: document.expiresAt?.toISOString().slice(0, 10) ?? null,
          reviewNote: document.reviewNote,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Services offered</CardTitle>
          <CardDescription>
            These decide which searches you appear in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-2">
            {business.categories.map(({ category }) => (
              <li
                key={category.id}
                className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-sm"
              >
                {category.name}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
