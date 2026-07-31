// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DocumentKind } from "@/generated/prisma/enums";
import {
  UploadValidationError,
  buildStorageKey,
  looksLikeText,
  sanitizeTitle,
  validateUpload,
} from "@/server/documents/validate-upload";

const MAX = 25 * 1024 * 1024;
const USER = "user_abc123";

/** Minimal but structurally valid file headers for magic-byte sniffing. */
const PDF_BYTES = Buffer.concat([
  Buffer.from("%PDF-1.7\n"),
  Buffer.from("1 0 obj\n<< /Type /Catalog >>\nendobj\n"),
  Buffer.from("%%EOF\n"),
]);
/** A real 1x1 PNG — a bare signature is not enough for magic-byte sniffing. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("sanitizeTitle", () => {
  it("drops the extension", () => {
    expect(sanitizeTitle("Week 3 Notes.pdf")).toBe("Week 3 Notes");
  });

  it("strips directory components from a crafted name", () => {
    expect(sanitizeTitle("../../etc/passwd.txt")).toBe("passwd");
    expect(sanitizeTitle("C:\\Windows\\system32\\evil.docx")).toBe("evil");
  });

  it("removes control characters", () => {
    expect(sanitizeTitle("bad\u0000name\u001b[31m.txt")).toBe("badname[31m");
  });

  it("collapses whitespace", () => {
    expect(sanitizeTitle("  lots   of    space .pdf")).toBe("lots of space");
  });

  it("falls back to Untitled for an empty result", () => {
    expect(sanitizeTitle(".pdf")).toBe("Untitled");
    expect(sanitizeTitle("   .txt")).toBe("Untitled");
  });

  it("truncates very long names", () => {
    expect(sanitizeTitle(`${"a".repeat(500)}.pdf`)).toHaveLength(200);
  });

  it("preserves unicode titles", () => {
    expect(sanitizeTitle("微积分 笔记.pdf")).toBe("微积分 笔记");
  });
});

describe("buildStorageKey", () => {
  it("namespaces by user and keeps the extension", () => {
    const key = buildStorageKey(USER, "pdf");
    expect(key.startsWith(`${USER}/`)).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("is unique per call", () => {
    expect(buildStorageKey(USER, "pdf")).not.toBe(buildStorageKey(USER, "pdf"));
  });

  it("strips unsafe characters from the extension", () => {
    expect(buildStorageKey(USER, "../sh")).toMatch(/\.sh$/);
  });
});

describe("looksLikeText", () => {
  it("accepts UTF-8 prose", () => {
    expect(looksLikeText(Buffer.from("hello — naïve café"))).toBe(true);
  });

  it("rejects content with null bytes", () => {
    expect(looksLikeText(Buffer.from([0x41, 0x00, 0x42]))).toBe(false);
  });

  it("rejects binary content", () => {
    expect(looksLikeText(Buffer.from([0xff, 0xfe, 0xfd, 0xfc]))).toBe(false);
  });
});

describe("validateUpload", () => {
  it("accepts a valid PDF", async () => {
    const result = await validateUpload({
      filename: "Lecture 1.pdf",
      buffer: PDF_BYTES,
      userId: USER,
      maxBytes: MAX,
    });
    expect(result.kind).toBe(DocumentKind.PDF);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.title).toBe("Lecture 1");
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts plain text and markdown", async () => {
    const txt = await validateUpload({
      filename: "notes.txt",
      buffer: Buffer.from("Some notes"),
      userId: USER,
      maxBytes: MAX,
    });
    expect(txt.kind).toBe(DocumentKind.TEXT);

    const md = await validateUpload({
      filename: "notes.md",
      buffer: Buffer.from("# Heading"),
      userId: USER,
      maxBytes: MAX,
    });
    expect(md.kind).toBe(DocumentKind.MARKDOWN);
  });

  it("accepts a PNG image", async () => {
    const result = await validateUpload({
      filename: "whiteboard.png",
      buffer: PNG_BYTES,
      userId: USER,
      maxBytes: MAX,
    });
    expect(result.kind).toBe(DocumentKind.IMAGE);
  });

  it("rejects an empty file", async () => {
    await expect(
      validateUpload({
        filename: "empty.pdf",
        buffer: Buffer.alloc(0),
        userId: USER,
        maxBytes: MAX,
      }),
    ).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("rejects a file over the size limit", async () => {
    await expect(
      validateUpload({
        filename: "big.txt",
        buffer: Buffer.from("x".repeat(200)),
        userId: USER,
        maxBytes: 100,
      }),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("rejects an unsupported extension", async () => {
    await expect(
      validateUpload({
        filename: "malware.exe",
        buffer: Buffer.from("MZ..."),
        userId: USER,
        maxBytes: MAX,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });

  it("rejects a file with no extension", async () => {
    await expect(
      validateUpload({
        filename: "README",
        buffer: Buffer.from("text"),
        userId: USER,
        maxBytes: MAX,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });

  it("rejects an executable disguised as a PDF", async () => {
    // Mach-O / ELF style header renamed to .pdf — the attack this guards.
    const disguised = Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      Buffer.alloc(256),
    ]);
    await expect(
      validateUpload({
        filename: "totally-safe.pdf",
        buffer: disguised,
        userId: USER,
        maxBytes: MAX,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_MISMATCH" });
  });

  it("rejects binary content disguised as text", async () => {
    await expect(
      validateUpload({
        filename: "notes.txt",
        buffer: Buffer.from([0x00, 0x01, 0x02, 0xff]),
        userId: USER,
        maxBytes: MAX,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_MISMATCH" });
  });

  it("rejects an image renamed to .pdf", async () => {
    await expect(
      validateUpload({
        filename: "slides.pdf",
        buffer: PNG_BYTES,
        userId: USER,
        maxBytes: MAX,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_MISMATCH" });
  });

  it("rejects a missing filename", async () => {
    await expect(
      validateUpload({
        filename: "   ",
        buffer: PDF_BYTES,
        userId: USER,
        maxBytes: MAX,
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
  });

  it("produces a storage key that never contains the original name", async () => {
    const result = await validateUpload({
      filename: "../../etc/passwd.txt",
      buffer: Buffer.from("text"),
      userId: USER,
      maxBytes: MAX,
    });
    expect(result.storageKey).not.toContain("passwd");
    expect(result.storageKey).not.toContain("..");
    expect(result.storageKey.startsWith(`${USER}/`)).toBe(true);
  });

  it("gives identical bytes the same checksum", async () => {
    const a = await validateUpload({
      filename: "a.txt",
      buffer: Buffer.from("same"),
      userId: USER,
      maxBytes: MAX,
    });
    const b = await validateUpload({
      filename: "b.txt",
      buffer: Buffer.from("same"),
      userId: USER,
      maxBytes: MAX,
    });
    expect(a.checksum).toBe(b.checksum);
  });
});
