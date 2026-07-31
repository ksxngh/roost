import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Standard empty state for pages and lists with no content yet. Keeping this
 * as one component ensures every empty screen explains itself and offers a
 * next action instead of showing a blank region.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      <div className="bg-muted text-muted-foreground mb-4 flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
