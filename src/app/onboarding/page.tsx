import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { currentMembership } from "@/server/businesses/access";
import { listServiceCategories } from "@/server/businesses/public";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Set up your business" };

/**
 * Provider onboarding. Deliberately outside the (app) group, whose layout
 * requires a business — this is the page that creates one.
 */
export default async function OnboardingPage() {
  const { user } = await requireSession();

  // Already set up: send them to the dashboard rather than letting them
  // create a second business that would orphan the first.
  const membership = await currentMembership(user.id);
  if (membership) {
    redirect("/dashboard");
  }

  const categories = await listServiceCategories();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center px-4">
        <BrandMark href="/" />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20">
        <div className="mb-8 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Set up your business
          </h1>
          <p className="text-muted-foreground text-sm">
            Three quick things and your dashboard is ready. You can change any
            of it later.
          </p>
        </div>
        <OnboardingForm categories={categories} />
      </main>
    </div>
  );
}
