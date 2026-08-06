"use client";

import { ExternalLink, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/validations/scheduling";
import {
  deleteQuoteAction,
  invoiceQuoteAction,
  sendQuoteAction,
} from "@/server/billing/actions";

export type QuoteRow = {
  id: string;
  reference: string;
  title: string;
  customerName: string;
  totalCents: number;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  declineReason: string | null;
  invoiceReference: string | null;
};

const STATUS = {
  DRAFT: { label: "Draft", variant: "secondary" as const },
  SENT: { label: "Awaiting reply", variant: "secondary" as const },
  ACCEPTED: { label: "Accepted", variant: "default" as const },
  DECLINED: { label: "Declined", variant: "destructive" as const },
  EXPIRED: { label: "Expired", variant: "outline" as const },
};

export function QuoteList({ quotes }: { quotes: QuoteRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(
    quote: QuoteRow,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    setBusyId(quote.id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  if (quotes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No quotes yet. Create one to price up a job.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {quotes.map((quote) => {
        const status = STATUS[quote.status];
        return (
          <li key={quote.id}>
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {quote.title}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {quote.customerName} · {formatPrice(quote.totalCents)}
                    </p>
                  </div>
                  <p className="text-muted-foreground font-mono text-xs">
                    {quote.reference}
                  </p>
                </div>

                {quote.declineReason ? (
                  <p className="text-destructive text-sm">
                    {quote.declineReason}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {quote.status === "DRAFT" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busyId === quote.id}
                        onClick={() =>
                          run(
                            quote,
                            () => sendQuoteAction(quote.id),
                            "Quote sent.",
                          )
                        }
                      >
                        <Send className="size-4" aria-hidden />
                        Send
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === quote.id}
                        onClick={() =>
                          run(
                            quote,
                            () => deleteQuoteAction(quote.id),
                            "Draft deleted.",
                          )
                        }
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </Button>
                    </>
                  ) : null}

                  {quote.status === "ACCEPTED" && !quote.invoiceReference ? (
                    <Button
                      size="sm"
                      disabled={busyId === quote.id}
                      onClick={() =>
                        run(
                          quote,
                          () => invoiceQuoteAction(quote.id),
                          "Invoice raised.",
                        )
                      }
                    >
                      Raise invoice
                    </Button>
                  ) : null}

                  {quote.invoiceReference ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/invoices">View invoice</Link>
                    </Button>
                  ) : null}

                  {quote.status !== "DRAFT" ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/quote/${quote.reference}`}>
                        <ExternalLink className="size-4" aria-hidden />
                        Customer view
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
