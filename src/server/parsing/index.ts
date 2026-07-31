import { DocumentKind } from "@/generated/prisma/enums";
import { parseDocx } from "@/server/parsing/docx";
import { parseImage } from "@/server/parsing/image";
import { parsePdf } from "@/server/parsing/pdf";
import { parsePptx } from "@/server/parsing/pptx";
import { parseText } from "@/server/parsing/text";
import { ParseError, type ParsedDocument } from "@/server/parsing/types";

export { ParseError } from "@/server/parsing/types";
export type { ParsedDocument, ParsedPage } from "@/server/parsing/types";

type Parser = (buffer: Buffer) => Promise<ParsedDocument>;

const PARSERS: Record<DocumentKind, Parser> = {
  [DocumentKind.PDF]: parsePdf,
  [DocumentKind.DOCX]: parseDocx,
  [DocumentKind.PPTX]: parsePptx,
  [DocumentKind.TEXT]: parseText,
  [DocumentKind.MARKDOWN]: parseText,
  [DocumentKind.IMAGE]: parseImage,
};

/** Dispatch to the parser for a document kind. */
export async function parseDocument(
  kind: DocumentKind,
  buffer: Buffer,
): Promise<ParsedDocument> {
  const parser = PARSERS[kind];
  if (!parser) {
    throw new ParseError(
      `No parser is available for ${kind} files.`,
      "UNSUPPORTED",
    );
  }
  return parser(buffer);
}
