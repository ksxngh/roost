import type { Metadata } from "next";
import { Upload, Library } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Library"
        description="All your uploaded material, organized by class and folder."
        actions={
          <Button disabled>
            <Upload className="size-4" aria-hidden="true" />
            Upload
          </Button>
        }
      />
      <EmptyState
        icon={Library}
        title="No material yet"
        description="Upload PDFs, slides, notes, or images and StudyForge will turn them into study material. Uploads arrive in Milestone 3."
      />
    </div>
  );
}
