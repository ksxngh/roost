import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "AI Chat" };

export default function ChatPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="AI Chat"
        description="Ask questions about your material and get answers with citations."
      />
      <EmptyState
        icon={MessageSquare}
        title="Nothing to chat about yet"
        description="Once you upload material, the AI tutor answers strictly from your documents — with page references and quoted sources."
      />
    </div>
  );
}
