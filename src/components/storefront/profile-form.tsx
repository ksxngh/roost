"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateProfileAction } from "@/server/businesses/actions";

type Profile = {
  name: string;
  tagline: string | null;
  about: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
};

export function ProfileForm({ business }: { business: Profile }) {
  const [form, setForm] = useState(business);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function field<K extends keyof Profile>(key: K) {
    return {
      value: form[key] ?? "",
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => setForm((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateProfileAction({
        name: form.name.trim(),
        // Empty strings mean "cleared", which the schema models as null.
        tagline: form.tagline?.trim() || null,
        about: form.about?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        website: form.website?.trim() || null,
      });
      if (result.ok) {
        toast.success("Profile saved.");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate>
        <CardHeader>
          <CardTitle className="text-base">Business profile</CardTitle>
          <CardDescription>
            What customers read before deciding to book you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Business name</Label>
            <Input id="profile-name" maxLength={120} {...field("name")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-tagline">Tagline</Label>
            <Input
              id="profile-tagline"
              placeholder="Same-day repairs across the Lower Mainland"
              maxLength={140}
              {...field("tagline")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-about">About</Label>
            <Textarea
              id="profile-about"
              rows={5}
              placeholder="What you do, how long you've been doing it, and what customers can expect."
              maxLength={2000}
              {...field("about")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                type="tel"
                placeholder="(604) 555-0142"
                maxLength={32}
                {...field("phone")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Contact email</Label>
              <Input
                id="profile-email"
                type="email"
                placeholder="hello@example.com"
                maxLength={254}
                {...field("email")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-website">Website</Label>
            <Input
              id="profile-website"
              type="url"
              placeholder="https://example.com"
              maxLength={300}
              {...field("website")}
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
