import mammoth from "mammoth";

import {
  ParseError,
  buildParsedDocument,
  type ParsedDocument,
} from "@/server/parsing/types";

/** Roughly a page of prose; used to paginate formats with no page breaks. */
const WORDS_PER_PAGE = 450;

/**
 * Split continuous text into page-sized chunks on paragraph boundaries.
 *
 * Word documents carry no reliable page breaks (pagination is a rendering
 * concern), but the study features need stable, citable units. Splitting on
 * paragraphs keeps each unit coherent instead of cutting mid-sentence.
 */
export function paginateByWords(
  text: string,
  wordsPerPage = WORDS_PER_PAGE,
): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  if (paragraphs.length === 0) {
    return [];
  }

  const pages: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).length;
    if (currentWords > 0 && currentWords + words > wordsPerPage) {
      pages.push(current.join("\n\n"));
      current = [];
      currentWords = 0;
    }
    current.push(paragraph.trim());
    currentWords += words;
  }
  if (current.length > 0) {
    pages.push(current.join("\n\n"));
  }
  return pages;
}

export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  let raw: string;
  try {
    const result = await mammoth.extractRawText({ buffer });
    raw = result.value;
  } catch (error) {
    throw new ParseError(
      "This Word document could not be read. It may be corrupted or in an older .doc format.",
      "CORRUPT",
      { cause: error },
    );
  }

  const pages = paginateByWords(raw);
  if (pages.length === 0) {
    throw new ParseError("This document contains no readable text.", "EMPTY");
  }
  return buildParsedDocument(pages);
}
