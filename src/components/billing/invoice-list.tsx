"use client";

import { Ban, CheckCircle2, ExternalLink, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { balanceCents } from "@/lib/money";
import { formatPrice } from "@/lib/validations/scheduling";
import {
  sendInvoiceAction,
  settleInvoiceAction,
  voidInvoiceAction,
} from "@/server/billing/actions";

export type InvoiceRow = {
  id: string;
  reference: string;
  number: number;
  title: string;
  customerName: string;
  totalCents: number;
  amountPaidCents: number;
  status: "DRAFT" | "SENT" | "PAID" | "VOID";
  dueAt: string | null;
};

const STATUS = {
  DRAFT: { label: "Draft", variant: "secondary" as const },
  SENT: { label: "Awaiting payment", variant: "secondary" as const },
  PAID: { label: "Paid", variant: "default" as const },
  VOID: { label: "Void", variant: "outline" as const },
};

export function InvoiceList({ invoices }: { invoices: InvoiceRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(
    invoice: InvoiceRow,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    setBusyId(invoice.id);
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

  if (invoices.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No invoices yet. Accept a quote to raise one, or bill a job directly.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {invoices.map((invoice) => {
        const status = STATUS[invoice.status];
        const outstanding = balanceCents(
          invoice.totalCents,
          invoice.amountPaidCents,
        );
        return (
          <li key={invoice.id}>
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      #{invoice.number} · {invoice.title}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {invoice.customerName} · {formatPrice(invoice.totalCents)}
                      {invoice.status !== "PAID" &&
                      invoice.amountPaidCents > 0 ? (
                        <> · {formatPrice(outstanding)} outstanding</>
                      ) : null}
                      {invoice.dueAt ? <> · due {invoice.dueAt}</> : null}
                    </p>
                  </div>
                  <p className="text-muted-foreground font-mono text-xs">
                    {invoice.reference}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {invoice.status === "DRAFT" ? (
                    <Button
                      size="sm"
                      disabled={busyId === invoice.id}
                      onClick={() =>
                        run(
                          invoice,
                          () => sendInvoiceAction(invoice.id),
                          "Invoice sent.",
                        )
                      }
                    >
                      <Send className="size-4" aria-hidden />
                      Send
                    </Button>
                  ) : null}

                  {invoice.status === "SENT" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busyId === invoice.id}
                        onClick={() =>
                          run(
                            invoice,
                            () => settleInvoiceAction(invoice.id),
                            "Marked as paid.",
                          )
                        }
                      >
                        <CheckCircle2 className="size-4" aria-hidden />
                        Mark paid
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === invoice.id}
                        onClick={() =>
                          run(
                            invoice,
                            () => voidInvoiceAction(invoice.id),
                            "Invoice voided.",
                          )
                        }
                      >
                        <Ban className="size-4" aria-hidden />
                        Void
                      </Button>
                    </>
                  ) : null}

                  {invoice.status !== "DRAFT" ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/invoice/${invoice.reference}`}>
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
