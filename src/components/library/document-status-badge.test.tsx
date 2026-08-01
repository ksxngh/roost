import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentStatusBadge } from "@/components/library/document-status-badge";
import { DocumentStatus } from "@/generated/prisma/enums";

describe("DocumentStatusBadge", () => {
  it.each([
    [DocumentStatus.PENDING, "Queued"],
    [DocumentStatus.PROCESSING, "Reading"],
    [DocumentStatus.READY, "Ready"],
    [DocumentStatus.FAILED, "Failed"],
  ])("labels %s as %s", (status, label) => {
    render(<DocumentStatusBadge status={status} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });

  it("announces in-flight states politely", () => {
    const { rerender } = render(
      <DocumentStatusBadge status={DocumentStatus.PROCESSING} />,
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");

    rerender(<DocumentStatusBadge status={DocumentStatus.PENDING} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("stops announcing once settled", () => {
    render(<DocumentStatusBadge status={DocumentStatus.READY} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "off");
  });
});
