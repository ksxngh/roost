import { render, screen } from "@testing-library/react";
import { Library } from "lucide-react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        icon={Library}
        title="No material yet"
        description="Upload something to get started."
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No material yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Upload something to get started."),
    ).toBeInTheDocument();
  });

  it("renders an action when provided and omits the slot when not", () => {
    const { rerender } = render(
      <EmptyState
        icon={Library}
        title="Empty"
        description="Nothing here."
        action={<Button>Upload</Button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();

    rerender(
      <EmptyState icon={Library} title="Empty" description="Nothing here." />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
