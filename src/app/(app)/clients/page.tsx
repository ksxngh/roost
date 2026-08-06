import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/validations/scheduling";
import { currentMembership } from "@/server/businesses/access";
import { listClients } from "@/server/businesses/clients";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const { q = "", archived } = await searchParams;
  const includeArchived = archived === "1";

  const clients = await listClients(user.id, membership.businessId, {
    search: q,
    includeArchived,
  });

  const searching = q.trim() !== "";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Clients"
        description="Every customer you've worked with, built automatically from your bookings, quotes, and invoices."
      />

      <Card>
        <CardContent className="pt-6">
          {/* A GET form, so a search is linkable and works without JS. */}
          <form method="get" className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-2">
              <Label htmlFor="client-search">Search</Label>
              <Input
                id="client-search"
                name="q"
                defaultValue={q}
                placeholder="Name, email, phone, or city"
                maxLength={80}
              />
            </div>
            {includeArchived ? (
              <input type="hidden" name="archived" value="1" />
            ) : null}
            <div className="flex items-end">
              <Button type="submit">
                <Search className="size-4" aria-hidden />
                Search
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={searching ? "No matching clients" : "No clients yet"}
          description={
            searching
              ? "Nobody matches that search. Try a name, email, or city."
              : "Your client list builds itself as bookings, quotes, and invoices come in — history, addresses, and notes included."
          }
        />
      ) : (
        <ul className="divide-border divide-y rounded-xl border">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/clients/${client.id}`}
                className="hover:bg-accent/50 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {client.name}
                    {client.archivedAt ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {client.email}
                    {client.city ? ` · ${client.city}, ${client.region}` : ""}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">
                    {formatPrice(client.lifetimeValueCents)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {client.jobCount === 1
                      ? "1 job"
                      : `${client.jobCount} jobs`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-sm">
        {includeArchived ? (
          <Link
            href={q ? `/clients?q=${encodeURIComponent(q)}` : "/clients"}
            className="hover:underline"
          >
            Hide archived clients
          </Link>
        ) : (
          <Link
            href={
              q
                ? `/clients?q=${encodeURIComponent(q)}&archived=1`
                : "/clients?archived=1"
            }
            className="hover:underline"
          >
            Show archived clients
          </Link>
        )}
      </p>
    </div>
  );
}
