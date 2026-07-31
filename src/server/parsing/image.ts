import { createWorker } from "tesseract.js";

import {
  ParseError,
  buildParsedDocument,
  type ParsedDocument,
} from "@/server/parsing/types";

/**
 * OCR for photos of notes, whiteboards, and screenshots.
 *
 * The Tesseract worker owns a native-ish runtime and language data, so it is
 * created per job and always terminated — a leaked worker would pin memory in
 * a long-running queue process.
 */
/**
 * Where Tesseract caches its ~5 MB language data. Without an explicit path it
 * downloads into the process working directory, littering the repo root.
 */
const OCR_CACHE_DIR = process.env.OCR_CACHE_DIR ?? ".cache/tesseract";

export async function parseImage(buffer: Buffer): Promise<ParsedDocument> {
  const worker = await createWorker("eng", undefined, {
    cachePath: OCR_CACHE_DIR,
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    const parsed = buildParsedDocument([text]);
    if (parsed.wordCount === 0) {
      throw new ParseError(
        "No text could be recognized in this image. A sharper, better-lit photo usually helps.",
        "EMPTY",
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    throw new ParseError(
      "This image could not be processed for text.",
      "CORRUPT",
      { cause: error },
    );
  } finally {
    await worker.terminate();
  }
}
