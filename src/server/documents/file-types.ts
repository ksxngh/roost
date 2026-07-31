import { DocumentKind } from "@/generated/prisma/enums";

/**
 * The upload allowlist. Everything the platform accepts is described here
 * once: extension, canonical MIME type, and the kind the parser dispatches
 * on. Anything not in this table is rejected.
 */
export type AcceptedType = {
  kind: DocumentKind;
  /** Canonical MIME type stored on the document row. */
  mimeType: string;
  extensions: readonly string[];
  /**
   * MIME types accepted from magic-byte sniffing. Text formats have no magic
   * bytes, so they are validated as UTF-8 instead (see `sniffed: null`).
   */
  sniffed: readonly string[] | null;
};

export const ACCEPTED_TYPES: readonly AcceptedType[] = [
  {
    kind: DocumentKind.PDF,
    mimeType: "application/pdf",
    extensions: ["pdf"],
    sniffed: ["application/pdf"],
  },
  {
    kind: DocumentKind.DOCX,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
    // OOXML files are ZIP containers; file-type reports the container.
    sniffed: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
    ],
  },
  {
    kind: DocumentKind.PPTX,
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extensions: ["pptx"],
    sniffed: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip",
    ],
  },
  {
    kind: DocumentKind.IMAGE,
    mimeType: "image/png",
    extensions: ["png"],
    sniffed: ["image/png"],
  },
  {
    kind: DocumentKind.IMAGE,
    mimeType: "image/jpeg",
    extensions: ["jpg", "jpeg"],
    sniffed: ["image/jpeg"],
  },
  {
    kind: DocumentKind.IMAGE,
    mimeType: "image/webp",
    extensions: ["webp"],
    sniffed: ["image/webp"],
  },
  {
    kind: DocumentKind.MARKDOWN,
    mimeType: "text/markdown",
    extensions: ["md", "markdown"],
    sniffed: null,
  },
  {
    kind: DocumentKind.TEXT,
    mimeType: "text/plain",
    extensions: ["txt", "text"],
    sniffed: null,
  },
] as const;

/** Extensions offered to the file picker, e.g. ".pdf,.docx,…". */
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.flatMap((type) =>
  type.extensions.map((extension) => `.${extension}`),
).join(",");

export function findTypeByExtension(
  extension: string,
): AcceptedType | undefined {
  const normalized = extension.toLowerCase().replace(/^\./, "");
  return ACCEPTED_TYPES.find((type) => type.extensions.includes(normalized));
}

/** Extension of a filename, lowercased and without the dot. */
export function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  return match ? match[1]!.toLowerCase() : "";
}
