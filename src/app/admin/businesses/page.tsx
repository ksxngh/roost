import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BusinessStatus } from "@/generated/prisma/enums";
import { formatRelativeTime, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listBusinesses } from "@/server/admin/verification";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "All businesses" };

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ACTIVE: "default",
  PENDING_REVIEW: "secondary",
  SUSPENDED: "destructive",
  DRAFT: "outline",
};

const FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Active", value: BusinessStatus.ACTIVE },
  { label: "Pending", value: BusinessStatus.PENDING_REVIEW },
  { label: "Suspended", value: BusinessStatus.SUSPENDED },
  { label: "Draft", value: BusinessStatus.DRAFT },
];

function isStatus(value: string | undefined): value is BusinessStatus {
  return (
    value === BusinessStatus.ACTIVE ||
    value === BusinessStatus.PENDING_REVIEW ||
    value === BusinessStatus.SUSPENDED ||
    value === BusinessStatus.DRAFT
  );
}

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { user } = await requireSession();
  const { status, q } = await searchParams;

  const businesses = await listBusinesses(user.id, {
    status: isStatus(status) ? status : undefined,
    query: q,
  });

  const activeFilter = status ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="All businesses"
        description="Every business on the platform — approve, suspend, or reinstate any of them."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
          {FILTERS.map((filter) => {
            const href = filter.value
              ? `/admin/businesses?status=${filter.value}`
              : "/admin/businesses";
            const active = activeFilter === filter.value;
            return (
              <Link
                key={filter.label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>

        <form action="/admin/businesses" className="shrink-0">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or slug…"
            className="sm:w-64"
            aria-label="Search businesses"
          />
        </form>
      </div>

      {businesses.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No businesses"
          description="No business matches this filter yet."
        />
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {businesses.map((business) => (
            <li key={business.id}>
              <Link
                href={`/admin/verification/${business.id}`}
                className="hover:bg-muted/50 flex items-center justify-between gap-4 px-4 py-4 transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{business.name}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {business.email ?? "No contact email"} · /pro/{business.slug}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={STATUS_VARIANT[business.status] ?? "outline"}>
                    {business.status.replace("_", " ")}
                  </Badge>
                  <span className="text-muted-foreground hidden text-sm sm:inline">
                    {formatRelativeTime(business.updatedAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-sm">
        {pluralize(businesses.length, "business", "businesses")} shown.
      </p>
    </div>
  );
}
