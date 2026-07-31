/** One page, slide, or logical section of a parsed document. */
export type ParsedPage = {
  /** 1-based. Used for citations in AI answers. */
  pageNumber: number;
  text: string;
};

export type ParsedDocument = {
  pages: ParsedPage[];
  pageCount: number;
  wordCount: number;
};

export class ParseError extends Error {
  constructor(
    message: string,
    readonly code: "CORRUPT" | "EMPTY" | "UNSUPPORTED" | "TOO_COMPLEX",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ParseError";
  }
}

/** Collapse runaway whitespace without destroying paragraph structure. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Assemble a ParsedDocument from page texts, dropping empty trailing pages. */
export function buildParsedDocument(pageTexts: string[]): ParsedDocument {
  const pages: ParsedPage[] = pageTexts.map((text, index) => ({
    pageNumber: index + 1,
    text: normalizeText(text),
  }));
  const wordCount = pages.reduce(
    (total, page) => total + countWords(page.text),
    0,
  );
  return { pages, pageCount: pages.length, wordCount };
}
