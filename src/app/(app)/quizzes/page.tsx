import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Quizzes" };

export default function QuizzesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Quizzes"
        description="Test yourself with generated quizzes and track your performance."
      />
      <EmptyState
        icon={GraduationCap}
        title="No quizzes yet"
        description="Generate multiple-choice, true/false, and short-answer quizzes from your uploads, then review detailed results here."
      />
    </div>
  );
}
