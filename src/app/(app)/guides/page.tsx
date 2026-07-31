import type { Metadata } from "next";
import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Study Guides" };

export default function GuidesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Study Guides"
        description="Summaries, cheat sheets, mind maps, and exam prep generated from your material."
      />
      <EmptyState
        icon={BookOpen}
        title="No guides yet"
        description="Generated study guides, summaries, and cheat sheets will be collected here once the generation engine ships."
      />
    </div>
  );
}
