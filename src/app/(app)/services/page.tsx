import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PackageEditor } from "@/components/services/package-editor";
import { currentMembership } from "@/server/businesses/access";
import { listPackages } from "@/server/businesses/packages";
import { listServiceCategories } from "@/server/businesses/public";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const [packages, categories] = await Promise.all([
    listPackages(user.id, membership.businessId),
    listServiceCategories(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Services"
        description="What customers can book, what it costs, and how long it takes."
      />
      <PackageEditor
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
        packages={packages.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          categoryId: row.categoryId,
          pricingModel: row.pricingModel,
          priceCents: row.priceCents,
          durationMinutes: row.durationMinutes,
          bufferMinutes: row.bufferMinutes,
          active: row.active,
        }))}
      />
    </div>
  );
}
