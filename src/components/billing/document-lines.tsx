"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  documentTotals,
  formatQuantity,
  lineTotalCents,
  parseAmountCents,
  parseQuantity,
  TAX_PRESETS,
} from "@/lib/money";
import { formatPrice } from "@/lib/validations/scheduling";

/** A line as the form holds it: text, so a half-typed number stays typeable. */
export type DraftLine = {
  description: string;
  quantity: string;
  unitPrice: string;
};

export const BLANK_LINE: DraftLine = {
  description: "",
  quantity: "1",
  unitPrice: "",
};

/** Text back to the integers the server wants, dropping unusable rows. */
export function toLineInputs(lines: readonly DraftLine[]) {
  return lines.flatMap((line) => {
    const quantityHundredths = parseQuantity(line.quantity);
    const unitPriceCents = parseAmountCents(line.unitPrice);
    if (
      line.description.trim() === "" ||
      quantityHundredths === null ||
      unitPriceCents === null
    ) {
      return [];
    }
    return [
      {
        description: line.description.trim(),
        quantityHundredths,
        unitPriceCents,
      },
    ];
  });
}

/**
 * Line editor with a running total.
 *
 * The total is computed with the *same* functions the server uses, so what a
 * provider sees while typing is what gets stored. A second implementation
 * here would eventually disagree by a cent.
 */
export function DocumentLines({
  lines,
  onChange,
  taxRateBps,
  onTaxChange,
}: {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  taxRateBps: number;
  onTaxChange: (bps: number) => void;
}) {
  const parsed = toLineInputs(lines);
  const totals = documentTotals(parsed, taxRateBps);

  function update(index: number, patch: Partial<DraftLine>) {
    onChange(
      lines.map((line, current) =>
        current === index ? { ...line, ...patch } : line,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {lines.map((line, index) => {
          const quantityHundredths = parseQuantity(line.quantity);
          const unitPriceCents = parseAmountCents(line.unitPrice);
          const total =
            quantityHundredths !== null && unitPriceCents !== null
              ? lineTotalCents({
                  description: line.description,
                  quantityHundredths,
                  unitPriceCents,
                })
              : null;

          return (
            <li key={index} className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1 space-y-1">
                <Label
                  htmlFor={`line-description-${index}`}
                  className="text-xs"
                >
                  Description
                </Label>
                <Input
                  id={`line-description-${index}`}
                  value={line.description}
                  onChange={(event) =>
                    update(index, { description: event.target.value })
                  }
                  placeholder="Labour"
                  maxLength={300}
                />
              </div>
              <div className="w-20 space-y-1">
                <Label htmlFor={`line-quantity-${index}`} className="text-xs">
                  Qty
                </Label>
                <Input
                  id={`line-quantity-${index}`}
                  value={line.quantity}
                  onChange={(event) =>
                    update(index, { quantity: event.target.value })
                  }
                  inputMode="decimal"
                />
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor={`line-price-${index}`} className="text-xs">
                  Unit price
                </Label>
                <Input
                  id={`line-price-${index}`}
                  value={line.unitPrice}
                  onChange={(event) =>
                    update(index, { unitPrice: event.target.value })
                  }
                  inputMode="decimal"
                  placeholder="95.00"
                />
              </div>
              <p className="w-24 pb-2 text-right text-sm font-medium tabular-nums">
                {total === null ? "—" : formatPrice(total)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove line ${index + 1}`}
                disabled={lines.length === 1}
                onClick={() =>
                  onChange(lines.filter((_, current) => current !== index))
                }
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...lines, { ...BLANK_LINE }])}
      >
        <Plus className="size-4" aria-hidden />
        Add line
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-4">
        <div className="w-56 space-y-1">
          <Label htmlFor="document-tax" className="text-xs">
            Tax
          </Label>
          <select
            id="document-tax"
            value={taxRateBps}
            onChange={(event) => onTaxChange(Number(event.target.value))}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            {TAX_PRESETS.map((preset) => (
              <option key={preset.bps} value={preset.bps}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <dl className="space-y-1 text-sm tabular-nums">
          <div className="flex justify-between gap-8">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatPrice(totals.subtotalCents)}</dd>
          </div>
          {totals.taxCents > 0 ? (
            <div className="flex justify-between gap-8">
              <dt className="text-muted-foreground">Tax</dt>
              <dd>{formatPrice(totals.taxCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-8 border-t pt-1 font-medium">
            <dt>Total</dt>
            <dd data-testid="document-total">
              {formatPrice(totals.totalCents)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** Read-only rendering, shared by the customer's quote and invoice pages. */
export function DocumentSummary({
  lines,
  subtotalCents,
  taxCents,
  totalCents,
  amountPaidCents,
}: {
  lines: readonly {
    id: string;
    description: string;
    quantityHundredths: number;
    unitPriceCents: number;
  }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents?: number;
}) {
  return (
    <div className="space-y-4">
      <ul className="divide-border divide-y text-sm">
        {lines.map((line) => (
          <li key={line.id} className="flex items-baseline gap-3 py-2">
            <span className="text-muted-foreground w-12 shrink-0 tabular-nums">
              {formatQuantity(line.quantityHundredths)}×
            </span>
            <span className="flex-1">{line.description}</span>
            <span className="tabular-nums">
              {formatPrice(
                lineTotalCents({
                  description: line.description,
                  quantityHundredths: line.quantityHundredths,
                  unitPriceCents: line.unitPriceCents,
                }),
              )}
            </span>
          </li>
        ))}
      </ul>

      <dl className="ml-auto max-w-xs space-y-1 text-sm tabular-nums">
        <div className="flex justify-between gap-8">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{formatPrice(subtotalCents)}</dd>
        </div>
        {taxCents > 0 ? (
          <div className="flex justify-between gap-8">
            <dt className="text-muted-foreground">Tax</dt>
            <dd>{formatPrice(taxCents)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-8 border-t pt-1 font-medium">
          <dt>Total</dt>
          <dd>{formatPrice(totalCents)}</dd>
        </div>
        {amountPaidCents !== undefined && amountPaidCents > 0 ? (
          <>
            <div className="flex justify-between gap-8">
              <dt className="text-muted-foreground">Paid</dt>
              <dd>−{formatPrice(amountPaidCents)}</dd>
            </div>
            <div className="flex justify-between gap-8 border-t pt-1 font-medium">
              <dt>Balance</dt>
              <dd>{formatPrice(Math.max(0, totalCents - amountPaidCents))}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </div>
  );
}
