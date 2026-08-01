// @vitest-environment node
/**
 * Route-level tests for credential upload. The service layer is stubbed here
 * on purpose — what is under test is the HTTP contract: who is turned away,
 * with what status, and what reaches the service when they are not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSession,
  mockCurrentMembership,
  mockCheckRateLimit,
  mockUpload,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCurrentMembership: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockUpload: vi.fn(),
}));

vi.mock("@/server/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/businesses/access", () => ({
  currentMembership: mockCurrentMembership,
}));
vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  RATE_LIMITS: { upload: { limit: 30, windowSeconds: 600 } },
}));
vi.mock("@/server/businesses/documents", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/businesses/documents")
  >("@/server/businesses/documents");
  return { ...actual, uploadBusinessDocument: mockUpload };
});

const { POST } = await import("@/app/api/documents/route");

const PDF = new File([Buffer.from("%PDF-1.4\n")], "licence.pdf", {
  type: "application/pdf",
});

function request(fields: Record<string, string | File>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request("http://localhost/api/documents", {
    method: "POST",
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
  mockCurrentMembership.mockResolvedValue({
    businessId: "biz-1",
    role: "OWNER",
  });
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetSeconds: 600,
  });
  mockUpload.mockResolvedValue({
    id: "doc-1",
    title: "licence",
    kind: "LICENCE",
    status: "PENDING",
  });
});

describe("POST /api/documents", () => {
  it("rejects a signed-out visitor", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await POST(request({ file: PDF, kind: "LICENCE" }));

    expect(response.status).toBe(401);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects a user with no business", async () => {
    mockCurrentMembership.mockResolvedValue(null);
    const response = await POST(request({ file: PDF, kind: "LICENCE" }));

    expect(response.status).toBe(403);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects an over-limit uploader and says when to retry", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetSeconds: 42,
    });
    const response = await POST(request({ file: PDF, kind: "LICENCE" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rate-limits per user, not per business", async () => {
    await POST(request({ file: PDF, kind: "LICENCE" }));
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "document-upload:user-1" }),
    );
  });

  it("requires a file", async () => {
    const response = await POST(request({ kind: "LICENCE" }));
    expect(response.status).toBe(400);
  });

  it.each(["", "ADMIN_OVERRIDE", "licence"])(
    "rejects the invalid kind %j",
    async (kind) => {
      const response = await POST(request({ file: PDF, kind }));
      expect(response.status).toBe(400);
      expect(mockUpload).not.toHaveBeenCalled();
    },
  );

  it("rejects an unparseable expiry date", async () => {
    const response = await POST(
      request({ file: PDF, kind: "LICENCE", expiresAt: "not-a-date" }),
    );
    expect(response.status).toBe(400);
  });

  it("passes the caller's own business id, never one from the request", async () => {
    await POST(
      request({ file: PDF, kind: "LICENCE", businessId: "someone-else" }),
    );

    expect(mockUpload).toHaveBeenCalledWith(
      "user-1",
      "biz-1",
      expect.objectContaining({ kind: "LICENCE", filename: "licence.pdf" }),
    );
  });

  it("stores a valid expiry date", async () => {
    await POST(
      request({ file: PDF, kind: "INSURANCE", expiresAt: "2027-01-31" }),
    );

    const [, , input] = mockUpload.mock.calls[0]!;
    expect((input.expiresAt as Date).toISOString()).toBe(
      "2027-01-31T00:00:00.000Z",
    );
  });

  it("returns 201 with the created document summary", async () => {
    const response = await POST(request({ file: PDF, kind: "LICENCE" }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "doc-1",
      title: "licence",
      kind: "LICENCE",
      status: "PENDING",
    });
  });

  it("maps a rejected file to 400 with the reason", async () => {
    const { DocumentValidationError } =
      await import("@/server/businesses/documents");
    mockUpload.mockRejectedValue(
      new DocumentValidationError(
        "Upload a PDF or a photo.",
        "UNSUPPORTED_TYPE",
      ),
    );

    const response = await POST(request({ file: PDF, kind: "LICENCE" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Upload a PDF or a photo.",
    });
  });

  it("maps an oversized file to 413", async () => {
    const { DocumentValidationError } =
      await import("@/server/businesses/documents");
    mockUpload.mockRejectedValue(
      new DocumentValidationError("Too big.", "TOO_LARGE"),
    );

    const response = await POST(request({ file: PDF, kind: "LICENCE" }));
    expect(response.status).toBe(413);
  });

  it("never leaks internal failures to the client", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mockUpload.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:5432"),
    );

    const response = await POST(request({ file: PDF, kind: "LICENCE" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Upload failed. Please try again.",
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
