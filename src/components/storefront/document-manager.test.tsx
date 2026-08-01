import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentManager } from "@/components/storefront/document-manager";

const { mockDelete, mockRefresh, mockToastError, mockToastSuccess } =
  vi.hoisted(() => ({
    mockDelete: vi.fn(),
    mockRefresh: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
  }));

vi.mock("@/server/businesses/actions", () => ({
  deleteDocumentAction: mockDelete,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

const documents = [
  {
    id: "d1",
    kind: "LICENCE" as const,
    title: "trade licence",
    sizeBytes: 2048,
    status: "APPROVED" as const,
    reviewNote: null,
    expiresAt: "2027-01-31",
  },
  {
    id: "d2",
    kind: "INSURANCE" as const,
    title: "certificate",
    sizeBytes: 4096,
    status: "REJECTED" as const,
    reviewNote: "The certificate has expired.",
    expiresAt: null,
  },
];

function pdf() {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "licence.pdf", {
    type: "application/pdf",
  });
}

/**
 * Submit the upload form directly.
 *
 * jsdom leaves a file input's `value` empty when files are set
 * programmatically, so the `required` attribute reports the field as invalid
 * and a button click never produces a submit event — even though the input
 * holds a file. Real browsers do not behave this way.
 */
function submitUploadForm() {
  const form = screen.getByLabelText("File").closest("form")!;
  fireEvent.submit(form);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDelete.mockResolvedValue({ ok: true });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "d3" }) }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DocumentManager", () => {
  it("lists documents with their review status", () => {
    render(<DocumentManager documents={documents} accept=".pdf" />);

    expect(screen.getByText("trade licence")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("shows the reviewer's note on a rejected document", () => {
    render(<DocumentManager documents={documents} accept=".pdf" />);
    expect(
      screen.getByText("The certificate has expired."),
    ).toBeInTheDocument();
  });

  it("links each document to the authenticated download route", () => {
    render(<DocumentManager documents={documents} accept=".pdf" />);
    expect(screen.getByRole("link", { name: "trade licence" })).toHaveAttribute(
      "href",
      "/api/documents/d1",
    );
  });

  it("prompts when nothing has been uploaded", () => {
    render(<DocumentManager documents={[]} accept=".pdf" />);
    expect(screen.getByText(/Nothing uploaded yet/)).toBeInTheDocument();
  });

  it("posts the file, kind, and expiry to the upload route", async () => {
    const user = userEvent.setup();
    render(<DocumentManager documents={[]} accept=".pdf" />);

    await user.upload(screen.getByLabelText("File"), pdf());
    await user.type(screen.getByLabelText("Expires (optional)"), "2027-01-31");
    submitUploadForm();
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/documents");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect((body.get("file") as File).name).toBe("licence.pdf");
    expect(body.get("kind")).toBe("LICENCE");
    expect(body.get("expiresAt")).toBe("2027-01-31");
  });

  it("does not post when no file is chosen", () => {
    render(<DocumentManager documents={[]} accept=".pdf" />);

    submitUploadForm();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces the server's rejection reason", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Upload a PDF or a photo." }),
    } as Response);
    const user = userEvent.setup();
    render(<DocumentManager documents={[]} accept=".pdf" />);

    await user.upload(screen.getByLabelText("File"), pdf());
    submitUploadForm();

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Upload a PDF or a photo."),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("reports a network failure instead of claiming success", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<DocumentManager documents={[]} accept=".pdf" />);

    await user.upload(screen.getByLabelText("File"), pdf());
    submitUploadForm();

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("refreshes the page after a successful upload", async () => {
    const user = userEvent.setup();
    render(<DocumentManager documents={[]} accept=".pdf" />);

    await user.upload(screen.getByLabelText("File"), pdf());
    submitUploadForm();

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("deletes a document by id", async () => {
    const user = userEvent.setup();
    render(<DocumentManager documents={documents} accept=".pdf" />);

    await user.click(
      screen.getByRole("button", { name: "Remove trade licence" }),
    );

    expect(mockDelete).toHaveBeenCalledWith("d1");
  });

  it("reports a failed deletion", async () => {
    mockDelete.mockResolvedValue({ ok: false, error: "Not allowed." });
    const user = userEvent.setup();
    render(<DocumentManager documents={documents} accept=".pdf" />);

    await user.click(
      screen.getByRole("button", { name: "Remove trade licence" }),
    );

    expect(mockToastError).toHaveBeenCalledWith("Not allowed.");
  });
});
