import { extractText, getDocumentProxy } from "unpdf";

import {
  ParseError,
  buildParsedDocument,
  type ParsedDocument,
} from "@/server/parsing/types";

/**
 * Extract text from a PDF, one entry per page so answers can cite page
 * numbers. Scanned PDFs yield little or no text — the caller reports that as
 * a parse failure with actionable wording rather than storing an empty
 * document that would silently produce useless study material.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  let pageTexts: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    pageTexts = Array.isArray(text) ? text : [text];
  } catch (error) {
    throw new ParseError(
      "This PDF could not be read. It may be corrupted or password-protected.",
      "CORRUPT",
      { cause: error },
    );
  }

  const parsed = buildParsedDocument(pageTexts);
  if (parsed.wordCount === 0) {
    throw new ParseError(
      "No selectable text found. If this is a scan, upload it as an image so it can be read with OCR.",
      "EMPTY",
    );
  }
  return parsed;
}
