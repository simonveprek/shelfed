// @vitest-environment happy-dom
// @vitest-environment-options {"settings": {"handleDisabledFileLoadingAsSuccess": true}}
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { MOBI } from "foliate-js/mobi.js";
import { afterAll, describe, expect, it } from "vitest";
import { epubToAzw3 } from "../src/main/azw3";
import { blocksOf } from "../src/renderer/src/lib/blocks";
import { buildDocx, pictureSize } from "../src/renderer/src/lib/docx";
import { buildEpub, type Content } from "../src/renderer/src/lib/epub";
import { buildFb2 } from "../src/renderer/src/lib/fb2";

// A real one-pixel PNG, so every format can carry and size it.
const PIXEL = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

const content: Content = {
  title: "Salt & Ink",
  authors: ["Ada Marsh"],
  language: "en",
  chapters: [
    { title: "One", xhtml: '<h1>One</h1><p>The <em>tide</em> came <strong>in</strong>.</p><p><img src="images/pic.png" alt=""/></p><blockquote><p>A line kept.</p></blockquote>', toc: true },
    { title: "Two", xhtml: "<h2>Two</h2><p>Gulls rose<br/>and settled.</p><hr/><ul><li>Lamp</li><li>Log</li></ul>", toc: true },
  ],
  images: new Map([["images/pic.png", { data: PIXEL, type: "image/png" }]]),
  css: "p { margin: 0 }",
  cover: { data: PIXEL, type: "image/png" },
};

const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const broken = (doc: Document) => doc.getElementsByTagName("parsererror").length > 0;

describe("a chapter as blocks", () => {
  it("keeps headings, emphasis, pictures, quotes, rules and list items", () => {
    const blocks = blocksOf(content.chapters[0].xhtml + content.chapters[1].xhtml);
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "image", "quote", "heading", "paragraph", "rule", "item", "item"]);
    expect(blocks[1]).toEqual({
      kind: "paragraph",
      runs: [{ text: "The " }, { text: "tide", italic: true }, { text: " came " }, { text: "in", bold: true }, { text: "." }],
    });
    expect(blocks[5]).toMatchObject({ runs: [{ text: "Gulls rose" }, { br: true }, { text: "and settled." }] });
  });

  it("splits a paragraph around a picture inside it", () => {
    expect(blocksOf('<p>Before <img src="images/a.png"/> after</p>').map((b) => b.kind)).toEqual(["paragraph", "image", "paragraph"]);
  });
});

describe("making Word", () => {
  const files = unzipSync(buildDocx(content));
  const doc = strFromU8(files["word/document.xml"]);

  it("is well formed, with its parts declared", () => {
    expect(broken(xml(doc))).toBe(false);
    expect(broken(xml(strFromU8(files["word/styles.xml"])))).toBe(false);
    expect(strFromU8(files["[Content_Types].xml"])).toContain("wordprocessingml.document.main+xml");
    expect(strFromU8(files["docProps/core.xml"])).toContain("<dc:title>Salt &amp; Ink</dc:title>");
  });

  it("keeps headings, italics and bold, and starts each chapter on a new page", () => {
    expect(doc).toContain('<w:pStyle w:val="Heading1"/>');
    expect(doc).toContain('<w:rPr><w:i/></w:rPr><w:t xml:space="preserve">tide</w:t>');
    expect(doc).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">in</w:t>');
    expect(doc.match(/<w:pageBreakBefore\/>/g)?.length).toBe(3);
  });

  it("carries a picture once, however often it's shown", () => {
    expect(Object.keys(files).filter((f) => f.startsWith("word/media/"))).toHaveLength(2);
    expect(doc.match(/r:embed="rImg\d+"/g)).toHaveLength(2);
  });

  it("reads picture sizes from their headers", () => {
    expect(pictureSize(PIXEL)).toEqual({ width: 1, height: 1 });
    expect(pictureSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("making FB2", () => {
  const text = new TextDecoder().decode(buildFb2(content));
  const doc = xml(text);

  it("is well formed FictionBook", () => {
    expect(broken(doc)).toBe(false);
    expect(doc.documentElement.tagName).toBe("FictionBook");
  });

  it("has the book's details, a section a chapter, and its pictures inside", () => {
    expect(doc.getElementsByTagName("book-title")[0].textContent).toBe("Salt & Ink");
    expect(doc.getElementsByTagName("last-name")[0].textContent).toBe("Marsh");
    expect(doc.getElementsByTagName("section")).toHaveLength(2);
    expect(doc.getElementsByTagName("binary")).toHaveLength(2);
    expect(text).toContain("<emphasis>tide</emphasis>");
    expect(text).toContain("<cite><p>A line kept.</p></cite>");
  });
});

describe("making AZW3", () => {
  const dir = mkdtempSync(join(tmpdir(), "shelf-azw3-test-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("turns an EPUB into a Kindle book that reads back", async () => {
    const epub = join(dir, "in.epub");
    writeFileSync(epub, buildEpub(content));
    const data = await epubToAzw3(resolve(import.meta.dirname, "../resources/azw3.wasm"), epub, "Salt & Ink", "Ada Marsh");
    // A Palm database of type BOOKMOBI, named for the book.
    expect(new TextDecoder().decode(data.subarray(60, 68))).toBe("BOOKMOBI");

    const book = await new MOBI({ unzlib: () => new Uint8Array() }).open(new Blob([new Uint8Array(data)]));
    expect(book.metadata.title).toBe("Salt & Ink");
    expect(book.metadata.author).toEqual(["Ada Marsh"]);
    const pages = await Promise.all(book.sections.filter((s: { createDocument?: unknown }) => s.createDocument).map((s: { createDocument: () => Promise<Document> }) => s.createDocument()));
    const words = pages.map((page: Document) => page.body?.textContent ?? "").join(" ");
    expect(words).toContain("The tide came in.");
    expect(words).toContain("Gulls rose");
  }, 30_000);

  it("says what went wrong with a file that isn't an EPUB", async () => {
    const bad = join(dir, "bad.epub");
    writeFileSync(bad, "not a zip");
    await expect(epubToAzw3(resolve(import.meta.dirname, "../resources/azw3.wasm"), bad, "x", "y")).rejects.toThrow(/Couldn't make the Kindle file/);
  }, 30_000);
});
