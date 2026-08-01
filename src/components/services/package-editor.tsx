"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDuration,
  formatPrice,
  SLOT_STEP_MINUTES,
} from "@/lib/validations/scheduling";
import {
  createPackageAction,
  deletePackageAction,
  updatePackageAction,
} from "@/server/businesses/actions";

type PricingModel = "FIXED" | "HOURLY" | "QUOTE";

export type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  pricingModel: PricingModel;
  priceCents: number | null;
  durationMinutes: number;
  bufferMinutes: number;
  active: boolean;
};

type Category = { id: string; name: string };

const PRICING_LABEL: Record<PricingModel, string> = {
  FIXED: "Fixed price",
  HOURLY: "Hourly",
  QUOTE: "Quote after visit",
};

const DURATION_CHOICES = [30, 45, 60, 90, 120, 180, 240, 480];

const BLANK: PackageRow = {
  id: "",
  name: "",
  description: null,
  categoryId: null,
  pricingModel: "FIXED",
  priceCents: null,
  durationMinutes: 60,
  bufferMinutes: 0,
  active: true,
};

/** Cents in, "120.00" out — the form edits dollars, the server stores cents. */
function toDollars(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function toCents(dollars: string): number | null {
  const trimmed = dollars.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  // Round rather than truncate so "19.999" does not silently become 19.99.
  return Math.round(parsed * 100);
}

export function PackageEditor({
  packages,
  categories,
}: {
  packages: PackageRow[];
  categories: Category[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open(row: PackageRow) {
    setEditing(row);
    setPrice(toDollars(row.priceCents));
    setError(null);
  }

  function field<K extends keyof PackageRow>(key: K, value: PackageRow[K]) {
    setEditing((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setError(null);

    const input = {
      name: editing.name.trim(),
      description: editing.description?.trim() || null,
      categoryId: editing.categoryId,
      pricingModel: editing.pricingModel,
      priceCents: editing.pricingModel === "QUOTE" ? null : toCents(price),
      durationMinutes: editing.durationMinutes,
      bufferMinutes: editing.bufferMinutes,
      active: editing.active,
    };

    startTransition(async () => {
      const result = editing.id
        ? await updatePackageAction(editing.id, input)
        : await createPackageAction(input);
      if (result.ok) {
        toast.success(editing.id ? "Service updated." : "Service added.");
        setEditing(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete(row: PackageRow) {
    startTransition(async () => {
      const result = await deletePackageAction(row.id);
      if (result.ok) {
        toast.success(`Removed ${row.name}.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Services you offer</CardTitle>
        <CardDescription>
          Each one becomes a bookable option with its own price and length.
        </CardDescription>
        {/* CardAction is the header's second grid column; a plain div here
            would span the full width instead of sitting beside the title. */}
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => open(BLANK)}>
            <Plus className="size-4" aria-hidden />
            Add service
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {packages.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No services yet. Customers can&apos;t book you until there&apos;s at
            least one.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-md border">
            {packages.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    {!row.active ? (
                      <Badge variant="secondary">Hidden</Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {row.pricingModel === "QUOTE"
                      ? "Quoted after a visit"
                      : `${formatPrice(row.priceCents ?? 0)}${
                          row.pricingModel === "HOURLY" ? " / hr" : ""
                        }`}{" "}
                    · {formatDuration(row.durationMinutes)}
                    {row.bufferMinutes > 0
                      ? ` + ${formatDuration(row.bufferMinutes)} buffer`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${row.name}`}
                  onClick={() => open(row)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${row.name}`}
                  disabled={pending}
                  onClick={() => handleDelete(row)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>
                {editing?.id ? "Edit service" : "Add a service"}
              </DialogTitle>
              <DialogDescription>
                The length decides how your calendar is carved into slots.
              </DialogDescription>
            </DialogHeader>

            {editing ? (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="package-name">Name</Label>
                  <Input
                    id="package-name"
                    value={editing.name}
                    onChange={(event) => field("name", event.target.value)}
                    placeholder="Drain unclogging"
                    maxLength={120}
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="package-description">Description</Label>
                  <Textarea
                    id="package-description"
                    rows={3}
                    value={editing.description ?? ""}
                    onChange={(event) =>
                      field("description", event.target.value)
                    }
                    placeholder="What's included, and what isn't."
                    maxLength={1000}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="package-pricing">Pricing</Label>
                    <Select
                      value={editing.pricingModel}
                      onValueChange={(value) =>
                        field("pricingModel", value as PricingModel)
                      }
                    >
                      <SelectTrigger id="package-pricing">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PRICING_LABEL) as PricingModel[]).map(
                          (model) => (
                            <SelectItem key={model} value={model}>
                              {PRICING_LABEL[model]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="package-price">
                      {editing.pricingModel === "HOURLY"
                        ? "Hourly rate"
                        : "Price"}
                    </Label>
                    <Input
                      id="package-price"
                      inputMode="decimal"
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                      placeholder="120.00"
                      disabled={editing.pricingModel === "QUOTE"}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="package-duration">How long it takes</Label>
                    <Select
                      value={String(editing.durationMinutes)}
                      onValueChange={(value) =>
                        field("durationMinutes", Number(value))
                      }
                    >
                      <SelectTrigger id="package-duration">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_CHOICES.map((minutes) => (
                          <SelectItem key={minutes} value={String(minutes)}>
                            {formatDuration(minutes)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="package-buffer">Buffer after</Label>
                    <Select
                      value={String(editing.bufferMinutes)}
                      onValueChange={(value) =>
                        field("bufferMinutes", Number(value))
                      }
                    >
                      <SelectTrigger id="package-buffer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[0, SLOT_STEP_MINUTES, 30, 45, 60].map((minutes) => (
                          <SelectItem key={minutes} value={String(minutes)}>
                            {minutes === 0 ? "None" : formatDuration(minutes)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {categories.length > 0 ? (
                  <div className="space-y-2">
                    <Label htmlFor="package-category">Trade</Label>
                    <Select
                      value={editing.categoryId ?? "none"}
                      onValueChange={(value) =>
                        field("categoryId", value === "none" ? null : value)
                      }
                    >
                      <SelectTrigger id="package-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No specific trade</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <div>
                    <Label htmlFor="package-active">Visible to customers</Label>
                    <p className="text-muted-foreground text-xs">
                      Turn off to keep it without offering it.
                    </p>
                  </div>
                  <Switch
                    id="package-active"
                    checked={editing.active}
                    onCheckedChange={(checked) => field("active", checked)}
                  />
                </div>

                {error ? (
                  <p role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
