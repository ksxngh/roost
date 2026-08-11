import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime, pluralize } from "@/lib/format";
import { listReviewQueue } from "@/server/admin/verification";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Verification queue" };

export default async function VerificationQueuePage() {
  const { user } = await requireSession();
  const queue = await listReviewQueue(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verification queue"
        description="Businesses awaiting review before they can list on the marketplace."
        actions={
          queue.length > 0 ? (
            <Badge variant="secondary">
              {pluralize(queue.length, "business", "businesses")}
            </Badge>
          ) : undefined
        }
      />

      {queue.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing to review"
          description="When a provider submits their business for verification, it will appear here."
        />
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {queue.map((item) => (
            <li key={item.id}>
              <Link
                href={`/admin/verification/${item.id}`}
                className="hover:bg-muted/50 flex items-center justify-between gap-4 px-4 py-4 transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {item.email ?? "No contact email"} · /pro/{item.slug}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant="outline">
                    {pluralize(item.documentCount, "doc", "docs")}
                  </Badge>
                  <span className="text-muted-foreground hidden text-sm sm:inline">
                    {formatRelativeTime(item.submittedAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
