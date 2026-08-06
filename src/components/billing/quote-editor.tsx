"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  BLANK_LINE,
  DocumentLines,
  toLineInputs,
  type DraftLine,
} from "@/components/billing/document-lines";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseAmountCents } from "@/lib/money";
import { createQuoteAction } from "@/server/billing/actions";

const BLANK = {
  title: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  addressLine1: "",
  city: "",
  region: "",
  postalCode: "",
  notes: "",
  internalNote: "",
  deposit: "",
  validUntil: "",
};

/** New quotes only; editing a draft reuses the same form on its own page. */
export function QuoteEditor() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [lines, setLines] = useState<DraftLine[]>([{ ...BLANK_LINE }]);
  const [taxRateBps, setTaxRateBps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function field(key: keyof typeof BLANK) {
    return {
      value: form[key],
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => setForm((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createQuoteAction({
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        internalNote: form.internalNote.trim() || null,
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        customerPhone: form.customerPhone.trim() || null,
        addressLine1: form.addressLine1.trim() || null,
        addressLine2: null,
        city: form.city.trim() || null,
        region: form.region.trim() || null,
        postalCode: form.postalCode.trim() || null,
        taxRateBps,
        depositCents: parseAmountCents(form.deposit) ?? 0,
        validUntil: form.validUntil || null,
        lines: toLineInputs(lines),
      });

      if (result.ok) {
        toast.success("Quote saved as a draft.");
        setOpen(false);
        setForm(BLANK);
        setLines([{ ...BLANK_LINE }]);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quotes</CardTitle>
        <CardDescription>
          Price up work that couldn&apos;t be quoted online, then send it for
          approval.
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New quote
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        A quote starts as a draft. Nothing is visible to the customer until you
        send it.
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>New quote</DialogTitle>
              <DialogDescription>
                Saved as a draft — you send it when it&apos;s ready.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="quote-title">Title</Label>
                <Input
                  id="quote-title"
                  placeholder="Bathroom re-pipe"
                  maxLength={160}
                  autoFocus
                  {...field("title")}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quote-customer">Customer name</Label>
                  <Input
                    id="quote-customer"
                    maxLength={120}
                    {...field("customerName")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quote-email">Customer email</Label>
                  <Input
                    id="quote-email"
                    type="email"
                    maxLength={254}
                    {...field("customerEmail")}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quote-phone">Phone (optional)</Label>
                  <Input
                    id="quote-phone"
                    type="tel"
                    maxLength={32}
                    {...field("customerPhone")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quote-address">Address (optional)</Label>
                  <Input
                    id="quote-address"
                    maxLength={160}
                    {...field("addressLine1")}
                  />
                </div>
              </div>

              <DocumentLines
                lines={lines}
                onChange={setLines}
                taxRateBps={taxRateBps}
                onTaxChange={setTaxRateBps}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quote-deposit">Deposit (optional)</Label>
                  <Input
                    id="quote-deposit"
                    inputMode="decimal"
                    placeholder="200.00"
                    {...field("deposit")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quote-valid">Valid until (optional)</Label>
                  <Input
                    id="quote-valid"
                    type="date"
                    {...field("validUntil")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quote-notes">Notes for the customer</Label>
                <Textarea id="quote-notes" rows={2} {...field("notes")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quote-internal">
                  Internal note (never shown to the customer)
                </Label>
                <Textarea
                  id="quote-internal"
                  rows={2}
                  {...field("internalNote")}
                />
              </div>

              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save draft"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
