// @vitest-environment happy-dom
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildDocx } from "../src/renderer/src/lib/docx";
import { buildEpub, type Content } from "../src/renderer/src/lib/epub";
import { buildFb2 } from "../src/renderer/src/lib/fb2";
import { layOut, type PdfPage } from "../src/shared/pdf-layout";
import { isLockedFile } from "../src/shared/locked";
import { xmlSafe } from "../src/shared/xml-safe";

/*
 * What people reported about 0.2.0, held in place: characters XML forbids
 * left in what Shelfed writes, and Kindle books with DRM taken for readable.
 */

const FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/;

describe("characters XML forbids", () => {
  it("are taken out, and nothing else is", () => {
    expect(xmlSafe("Raptor. \u0001 First \u0002 Iteration")).toBe("Raptor.  First  Iteration");
    expect(xmlSafe("tab\there\nline\r\nend")).toBe("tab\there\nline\r\nend");
    expect(xmlSafe("Příliš žluťoučký kůň 📚")).toBe("Příliš žluťoučký kůň 📚");
    // Half a surrogate pair on its own, either half, and the two non-characters.
    expect(xmlSafe("a\ud83db\udcdac￾d￿")).toBe("abcd");
  });

  // The chapter, its title and the book's details, as text from a PDF or any other file can carry them.
  const content: Content = {
    title: "Jurassic\u0001 Park",
    authors: ["Michael\u0002 Crichton"],
    language: "en",
    chapters: [{ title: "Prologue\u0001", xhtml: "<p>The Bite of the Raptor. \u0001 First Iteration\u0002</p>", toc: true }],
    images: new Map(),
    css: "",
  };

  it("never reach a made EPUB, in its chapters, contents or details", () => {
    const files = unzipSync(buildEpub(content));
    for (const [name, data] of Object.entries(files)) if (/\.(xhtml|opf|ncx|xml)$/.test(name)) expect(strFromU8(data), name).not.toMatch(FORBIDDEN);
    expect(strFromU8(files["OEBPS/text/ch001.xhtml"])).toContain("The Bite of the Raptor.  First Iteration");
    expect(strFromU8(files["OEBPS/content.opf"])).toContain("<dc:title>Jurassic Park</dc:title>");
  });

  it("never reach a made Word or FB2 file either", () => {
    const docx = unzipSync(buildDocx(content));
    for (const [name, data] of Object.entries(docx)) if (name.endsWith(".xml")) expect(strFromU8(data), name).not.toMatch(FORBIDDEN);
    expect(new TextDecoder().decode(buildFb2(content))).not.toMatch(FORBIDDEN);
  });

  it("are left out of a PDF's bookmark titles", () => {
    const line = (text: string, y: number, size = 11) => ({ text, x: 72, y, width: text.length * 5, size });
    const pages: PdfPage[] = [
      { number: 1, width: 600, height: 800, items: [line("Prologue", 700, 22), line("The bite of the raptor came at night.", 660)], pictures: [] },
      { number: 2, width: 600, height: 800, items: [line("First Iteration", 700, 22), line("The island was quiet that morning.", 660)], pictures: [] },
    ] as unknown as PdfPage[];
    const marks = [
      { title: "Prologue\u0001", page: 1, depth: 0 },
      { title: "\u0002First Iteration", page: 2, depth: 0 },
    ];
    const { chapters } = layOut(pages, marks, { tidy: true, join: true, headings: true, pictures: false, chapters: "marks", every: 10, from: 1, to: 2 }, { start: "Start", pages: (a, b) => `Pages ${a} to ${b}` });
    const titles = chapters.map((c) => c.title);
    expect(titles).toContain("Prologue");
    expect(titles).toContain("First Iteration");
    for (const title of titles) expect(title).not.toMatch(FORBIDDEN);
  });
});

/** The start of a MOBI file as far as its first record's header, with its encryption field set. */
function mobi(encryption: number) {
  const file = new Uint8Array(96);
  file.set(new TextEncoder().encode("BOOKMOBI"), 60);
  const view = new DataView(file.buffer);
  view.setUint16(76, 1);
  view.setUint32(78, 80);
  view.setUint16(80 + 12, encryption);
  return file;
}

const reader = (bytes: Uint8Array) => async (offset: number, length: number) => bytes.subarray(offset, offset + length);

describe("Kindle books locked with DRM", () => {
  it("are told apart from ones that open, from their first bytes", async () => {
    expect(await isLockedFile("Leaders Eat Last.azw3", reader(mobi(2)))).toBe(true);
    expect(await isLockedFile("Leaders Eat Last.mobi", reader(mobi(1)))).toBe(true);
    expect(await isLockedFile("Mine.azw3", reader(mobi(0)))).toBe(false);
    expect(await isLockedFile("Old.azw", reader(new Uint8Array([...new TextEncoder().encode("TPZ0"), ...new Uint8Array(100)])))).toBe(true);
    expect(await isLockedFile("Bought.kfx", reader(new Uint8Array(4)))).toBe(true);
  });

  it("are never guessed at from a file too short, or one that isn't a Kindle book", async () => {
    expect(await isLockedFile("Short.azw3", reader(mobi(2).subarray(0, 60)))).toBe(false);
    expect(await isLockedFile("Essay.pdf", reader(mobi(2)))).toBe(false);
    expect(await isLockedFile("Broken.azw3", async () => { throw new Error("gone"); })).toBe(false);
  });
});