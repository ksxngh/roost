"use client";

import { Check, MapPin, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createBusinessAction } from "@/server/businesses/actions";

type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

type Area = { city: string; region: string; country: string };

const MAX_CATEGORIES = 10;

export function OnboardingForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleCategory(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= MAX_CATEGORIES
          ? current
          : [...current, id],
    );
  }

  function addArea(event: React.FormEvent) {
    // Nested inside the outer form, so stop this from submitting everything.
    event.preventDefault();
    const trimmedCity = city.trim();
    const trimmedRegion = region.trim().toUpperCase();
    if (!trimmedCity || trimmedRegion.length < 2) return;

    const duplicate = areas.some(
      (area) =>
        area.city.toLowerCase() === trimmedCity.toLowerCase() &&
        area.region === trimmedRegion,
    );
    if (!duplicate) {
      setAreas((current) => [
        ...current,
        { city: trimmedCity, region: trimmedRegion, country: "CA" },
      ]);
    }
    setCity("");
    setRegion("");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBusinessAction({
        name: name.trim(),
        categoryIds: selected,
        serviceAreas: areas,
      });
      if (result.ok) {
        toast.success("Business created — welcome aboard.");
        router.push("/storefront");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const canSubmit =
    name.trim().length >= 2 && selected.length > 0 && areas.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. What&apos;s it called?</CardTitle>
          <CardDescription>
            The name customers will see on your storefront.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="business-name">Business name</Label>
            <Input
              id="business-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Northside Plumbing"
              maxLength={120}
              autoFocus
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. What do you do?</CardTitle>
          <CardDescription>
            Pick the services you offer — up to {MAX_CATEGORIES}. These decide
            which searches you appear in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const isSelected = selected.includes(category.id);
              const atLimit = !isSelected && selected.length >= MAX_CATEGORIES;
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    disabled={atLimit}
                    aria-pressed={isSelected}
                    title={category.description ?? undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                      isSelected
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "hover:bg-accent",
                      atLimit && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {isSelected ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : null}
                    {category.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground mt-3 text-xs">
            {selected.length} of {MAX_CATEGORIES} selected
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Where do you work?</CardTitle>
          <CardDescription>
            Add every city you&apos;ll travel to. Customers searching those
            cities will find you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {areas.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {areas.map((area) => (
                <li
                  key={`${area.city}-${area.region}`}
                  className="bg-secondary text-secondary-foreground flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm"
                >
                  <MapPin className="size-3.5" aria-hidden />
                  {area.city}, {area.region}
                  <button
                    type="button"
                    aria-label={`Remove ${area.city}, ${area.region}`}
                    onClick={() =>
                      setAreas((current) =>
                        current.filter(
                          (item) =>
                            !(
                              item.city === area.city &&
                              item.region === area.region
                            ),
                        ),
                      )
                    }
                    className="hover:text-destructive ml-1"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1 space-y-2">
              <Label htmlFor="area-city">City</Label>
              <Input
                id="area-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Surrey"
                maxLength={80}
              />
            </div>
            <div className="w-full space-y-2 sm:w-28">
              <Label htmlFor="area-region">Province</Label>
              <Input
                id="area-region"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder="BC"
                maxLength={3}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={addArea}
                disabled={!city.trim() || region.trim().length < 2}
              >
                <Plus className="size-4" aria-hidden />
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || !canSubmit}>
          {pending ? "Creating…" : "Create my business"}
        </Button>
        <p className="text-muted-foreground text-sm">
          You&apos;ll add pricing and documents next.
        </p>
      </div>
    </form>
  );
}
