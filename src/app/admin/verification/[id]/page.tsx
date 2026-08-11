import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { DecisionPanel } from "@/components/admin/decision-panel";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlatformRole } from "@/generated/prisma/enums";
import { formatRelativeTime } from "@/lib/format";
import { platformRoleOf } from "@/server/admin/access";
import { NotFoundError } from "@/server/businesses/access";
import { getReviewDetail } from "@/server/admin/verification";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Review business" };

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ACTIVE: "default",
  PENDING_REVIEW: "secondary",
  SUSPENDED: "destructive",
  DRAFT: "outline",
};

const DOC_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  APPROVED: "default",
  PENDING: "secondary",
  REJECTED: "destructive",
};

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireSession();
  const { id } = await params;

  let detail;
  try {
    detail = await getReviewDetail(user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const role = await platformRoleOf(user.id);
  const canDecide = role === PlatformRole.ADMIN;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/verification"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to queue
      </Link>

      <PageHeader
        title={detail.name}
        description={`/pro/${detail.slug}`}
        actions={
          <Badge variant={STATUS_VARIANT[detail.status] ?? "outline"}>
            {detail.status.replace("_", " ")}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Business details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Field label="Email" value={detail.email} />
              <Field label="Phone" value={detail.phone} />
              <Field label="Website" value={detail.website} />
              <Field
                label="Insured until"
                value={
                  detail.insuredUntil
                    ? detail.insuredUntil.toLocaleDateString()
                    : null
                }
              />
              {detail.about ? (
                <div>
                  <p className="text-muted-foreground">About</p>
                  <p className="mt-1 whitespace-pre-line">{detail.about}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>
                Licence and insurance uploaded by the business. Downloads are
                logged and never rendered inline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detail.documents.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No documents uploaded.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {detail.documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <a
                        href={`/api/admin/documents/${doc.id}`}
                        className="hover:text-foreground text-foreground/90 inline-flex items-center gap-2 text-sm font-medium"
                      >
                        <FileText className="text-muted-foreground size-4" />
                        {doc.kind.replace("_", " ")}
                      </a>
                      <div className="flex items-center gap-2">
                        {doc.expiresAt ? (
                          <span className="text-muted-foreground text-xs">
                            expires {doc.expiresAt.toLocaleDateString()}
                          </span>
                        ) : null}
                        <Badge variant={DOC_VARIANT[doc.status] ?? "outline"}>
                          {doc.status}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canDecide ? (
            <Card>
              <CardHeader>
                <CardTitle>Decision</CardTitle>
              </CardHeader>
              <CardContent>
                <DecisionPanel businessId={detail.id} status={detail.status} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Decision</CardTitle>
                <CardDescription>
                  Reviewers can view submissions; only administrators can
                  approve or reject.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.history.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No decisions yet.
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {detail.history.map((entry, index) => (
                    <li key={index} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">
                          {entry.action.toLowerCase()}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        by {entry.reviewer ?? "a former admin"}
                      </p>
                      {entry.note ? (
                        <p className="text-muted-foreground">{entry.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}
