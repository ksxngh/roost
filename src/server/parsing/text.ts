import { paginateByWords } from "@/server/parsing/docx";
import {
  ParseError,
  buildParsedDocument,
  type ParsedDocument,
} from "@/server/parsing/types";

/**
 * Plain text and Markdown. Markdown is kept as-is rather than stripped:
 * headings and lists are meaningful structure for the AI features, and the
 * UI renders it.
 */
export async function parseText(buffer: Buffer): Promise<ParsedDocument> {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const pages = paginateByWords(raw);
  if (pages.length === 0) {
    throw new ParseError("This file contains no readable text.", "EMPTY");
  }
  return buildParsedDocument(pages);
}
