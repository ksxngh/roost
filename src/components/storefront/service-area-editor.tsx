"use client";

import { MapPin, Plus, X } from "lucide-react";
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
import {
  addServiceAreaAction,
  removeServiceAreaAction,
} from "@/server/businesses/actions";

type Area = { id: string; city: string; region: string };

export function ServiceAreaEditor({ areas }: { areas: Area[] }) {
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addServiceAreaAction({
        city: city.trim(),
        region: region.trim().toUpperCase(),
        country: "CA",
      });
      if (result.ok) {
        setCity("");
        setRegion("");
        toast.success("Area added.");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRemove(area: Area) {
    startTransition(async () => {
      const result = await removeServiceAreaAction(area.id);
      if (result.ok) toast.success(`Removed ${area.city}.`);
      else toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Areas you serve</CardTitle>
        <CardDescription>
          Customers searching these cities will find you. Add every place
          you&apos;ll travel to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {areas.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <li
                key={area.id}
                className="bg-secondary text-secondary-foreground flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm"
              >
                <MapPin className="size-3.5" aria-hidden />
                {area.city}, {area.region}
                <button
                  type="button"
                  aria-label={`Remove ${area.city}, ${area.region}`}
                  onClick={() => handleRemove(area)}
                  disabled={pending}
                  className="hover:text-destructive ml-1"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No areas yet — nobody can find you until you add one.
          </p>
        )}

        <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-area-city">City</Label>
            <Input
              id="new-area-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Surrey"
              maxLength={80}
            />
          </div>
          <div className="w-full space-y-2 sm:w-28">
            <Label htmlFor="new-area-region">Province</Label>
            <Input
              id="new-area-region"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder="BC"
              maxLength={3}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              variant="outline"
              disabled={pending || !city.trim() || region.trim().length < 2}
            >
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
