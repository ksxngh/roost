import type { Metadata } from "next";
import { SquareStack } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Flashcards" };

export default function FlashcardsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Flashcards"
        description="Review with spaced repetition, or generate new decks from your material."
      />
      <EmptyState
        icon={SquareStack}
        title="No decks yet"
        description="Decks you create or generate from uploads will live here, with daily reviews scheduled automatically."
      />
    </div>
  );
}
