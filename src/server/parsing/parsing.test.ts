// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { DocumentKind } from "@/generated/prisma/enums";
import { paginateByWords, parseDocx } from "@/server/parsing/docx";
import { parseDocument } from "@/server/parsing/index";
import {
  extractSlideText,
  parsePptx,
  sortSlidePaths,
} from "@/server/parsing/pptx";
import { parseText } from "@/server/parsing/text";
import {
  ParseError,
  buildParsedDocument,
  countWords,
  normalizeText,
} from "@/server/parsing/types";

describe("normalizeText", () => {
  it("normalizes line endings", () => {
    expect(normalizeText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("collapses horizontal whitespace but keeps paragraphs", () => {
    expect(normalizeText("a    b\n\n\n\nc")).toBe("a b\n\nc");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeText("\n\n  hello  \n\n")).toBe("hello");
  });
});

describe("countWords", () => {
  it("counts words and handles empty input", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("   ")).toBe(0);
    expect(countWords("")).toBe(0);
  });
});

describe("buildParsedDocument", () => {
  it("numbers pages from one and totals words", () => {
    const parsed = buildParsedDocument(["one two", "three"]);
    expect(parsed.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(parsed.pageCount).toBe(2);
    expect(parsed.wordCount).toBe(3);
  });

  it("handles no pages", () => {
    const parsed = buildParsedDocument([]);
    expect(parsed.pageCount).toBe(0);
    expect(parsed.wordCount).toBe(0);
  });
});

describe("paginateByWords", () => {
  it("keeps a short document on one page", () => {
    expect(paginateByWords("short text here")).toHaveLength(1);
  });

  it("splits long text on paragraph boundaries", () => {
    const paragraph = `${"word ".repeat(100).trim()}`;
    const text = Array.from({ length: 10 }, () => paragraph).join("\n\n");
    const pages = paginateByWords(text, 200);
    expect(pages.length).toBeGreaterThan(1);
    // No paragraph may be split across pages.
    for (const page of pages) {
      expect(page.split("\n\n").every((p) => p.trim().length > 0)).toBe(true);
    }
  });

  it("never drops content", () => {
    const text = Array.from(
      { length: 6 },
      (_, i) => `Paragraph ${i} ${"filler ".repeat(80)}`,
    ).join("\n\n");
    const pages = paginateByWords(text, 100);
    for (let i = 0; i < 6; i += 1) {
      expect(pages.join("\n\n")).toContain(`Paragraph ${i}`);
    }
  });

  it("returns nothing for empty input", () => {
    expect(paginateByWords("")).toEqual([]);
    expect(paginateByWords("   \n\n  ")).toEqual([]);
  });

  it("keeps an oversized single paragraph intact rather than cutting it", () => {
    const huge = "word ".repeat(1000).trim();
    const pages = paginateByWords(huge, 100);
    expect(pages).toHaveLength(1);
  });
});

describe("parseText", () => {
  it("parses plain text into pages", async () => {
    const parsed = await parseText(Buffer.from("Hello world\n\nSecond para"));
    expect(parsed.wordCount).toBe(4);
    expect(parsed.pages[0]!.text).toContain("Hello world");
  });

  it("preserves markdown structure", async () => {
    const parsed = await parseText(
      Buffer.from("# Title\n\n- bullet one\n- bullet two"),
    );
    expect(parsed.pages[0]!.text).toContain("# Title");
    expect(parsed.pages[0]!.text).toContain("- bullet one");
  });

  it("rejects an empty file", async () => {
    await expect(parseText(Buffer.from("   "))).rejects.toBeInstanceOf(
      ParseError,
    );
  });

  it("handles unicode", async () => {
    const parsed = await parseText(Buffer.from("café 微积分 —"));
    expect(parsed.pages[0]!.text).toContain("微积分");
  });
});

describe("extractSlideText", () => {
  it("extracts text runs", () => {
    const xml =
      "<p:sld><a:p><a:r><a:t>Photosynthesis</a:t></a:r></a:p></p:sld>";
    expect(extractSlideText(xml)).toBe("Photosynthesis");
  });

  it("separates paragraphs with newlines", () => {
    const xml =
      "<a:p><a:r><a:t>First</a:t></a:r></a:p><a:p><a:r><a:t>Second</a:t></a:r></a:p>";
    expect(extractSlideText(xml)).toBe("First\nSecond");
  });

  it("joins runs within one paragraph", () => {
    const xml =
      "<a:p><a:r><a:t>Hello </a:t></a:r><a:r><a:t>world</a:t></a:r></a:p>";
    expect(extractSlideText(xml)).toBe("Hello world");
  });

  it("decodes XML entities in the right order", () => {
    const xml =
      "<a:p><a:r><a:t>Tom &amp; Jerry &lt;3 &quot;fun&quot;</a:t></a:r></a:p>";
    expect(extractSlideText(xml)).toBe('Tom & Jerry <3 "fun"');
  });

  it("does not double-decode escaped entities", () => {
    const xml = "<a:p><a:r><a:t>&amp;lt;tag&amp;gt;</a:t></a:r></a:p>";
    expect(extractSlideText(xml)).toBe("&lt;tag&gt;");
  });

  it("handles explicit line breaks", () => {
    const xml =
      "<a:p><a:r><a:t>Line one</a:t></a:r><a:br/><a:r><a:t>Line two</a:t></a:r></a:p>";
    expect(extractSlideText(xml)).toBe("Line one\nLine two");
  });

  it("returns empty string for a slide with no text", () => {
    expect(extractSlideText("<p:sld><p:pic/></p:sld>")).toBe("");
  });
});

describe("sortSlidePaths", () => {
  it("orders slides numerically, not lexicographically", () => {
    const sorted = sortSlidePaths([
      "ppt/slides/slide10.xml",
      "ppt/slides/slide2.xml",
      "ppt/slides/slide1.xml",
    ]);
    expect(sorted).toEqual([
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
      "ppt/slides/slide10.xml",
    ]);
  });
});

/** Build a minimal but genuine .pptx container. */
async function buildPptx(slides: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  slides.forEach((text, index) => {
    zip.file(
      `ppt/slides/slide${index + 1}.xml`,
      `<?xml version="1.0"?><p:sld><p:cSld><p:spTree><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>`,
    );
  });
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("parsePptx", () => {
  it("produces one page per slide, in order", async () => {
    const buffer = await buildPptx([
      "Intro to Cells",
      "Mitochondria",
      "Summary",
    ]);
    const parsed = await parsePptx(buffer);
    expect(parsed.pageCount).toBe(3);
    expect(parsed.pages[0]!.text).toBe("Intro to Cells");
    expect(parsed.pages[2]!.text).toBe("Summary");
  });

  it("keeps slide order beyond nine slides", async () => {
    const buffer = await buildPptx(
      Array.from({ length: 12 }, (_, i) => `Slide ${i + 1}`),
    );
    const parsed = await parsePptx(buffer);
    expect(parsed.pages[9]!.text).toBe("Slide 10");
    expect(parsed.pages[11]!.text).toBe("Slide 12");
  });

  it("rejects a corrupt archive", async () => {
    await expect(
      parsePptx(Buffer.from("this is not a zip file")),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it("rejects an archive with no slides", async () => {
    const zip = new JSZip();
    zip.file("docProps/app.xml", "<xml/>");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await expect(parsePptx(buffer)).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("rejects slides that contain no text", async () => {
    const buffer = await buildPptx(["", "", ""]);
    await expect(parsePptx(buffer)).rejects.toMatchObject({ code: "EMPTY" });
  });
});

describe("parseDocx", () => {
  it("reports a clear error for a corrupt file", async () => {
    await expect(parseDocx(Buffer.from("not a docx"))).rejects.toBeInstanceOf(
      ParseError,
    );
  });
});

describe("parseDocument dispatch", () => {
  it("routes text and markdown to the text parser", async () => {
    const text = await parseDocument(
      DocumentKind.TEXT,
      Buffer.from("plain content"),
    );
    expect(text.wordCount).toBe(2);

    const markdown = await parseDocument(
      DocumentKind.MARKDOWN,
      Buffer.from("# heading"),
    );
    expect(markdown.pages[0]!.text).toContain("# heading");
  });

  it("routes pptx to the presentation parser", async () => {
    const buffer = await buildPptx(["Routed correctly"]);
    const parsed = await parseDocument(DocumentKind.PPTX, buffer);
    expect(parsed.pages[0]!.text).toBe("Routed correctly");
  });
});
