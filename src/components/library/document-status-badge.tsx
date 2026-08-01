import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";

import { DocumentStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const PRESENTATION = {
  [DocumentStatus.PENDING]: {
    label: "Queued",
    icon: Clock,
    className: "text-muted-foreground",
    spin: false,
  },
  [DocumentStatus.PROCESSING]: {
    label: "Reading",
    icon: Loader2,
    className: "text-primary",
    spin: true,
  },
  [DocumentStatus.READY]: {
    label: "Ready",
    icon: CheckCircle2,
    className: "text-success",
    spin: false,
  },
  [DocumentStatus.FAILED]: {
    label: "Failed",
    icon: AlertCircle,
    className: "text-destructive",
    spin: false,
  },
} as const;

/**
 * Processing state for a document. The live region announces transitions so
 * screen-reader users learn when a file becomes ready without polling the
 * page themselves.
 */
export function DocumentStatusBadge({
  status,
  className,
}: {
  status: DocumentStatus;
  className?: string;
}) {
  const { label, icon: Icon, className: tone, spin } = PRESENTATION[status];
  const inFlight =
    status === DocumentStatus.PENDING || status === DocumentStatus.PROCESSING;

  return (
    <span
      className={cn("flex items-center gap-1.5 text-xs", tone, className)}
      role="status"
      aria-live={inFlight ? "polite" : "off"}
    >
      <Icon className={cn("size-3.5", spin && "animate-spin")} aria-hidden />
      {label}
    </span>
  );
}
