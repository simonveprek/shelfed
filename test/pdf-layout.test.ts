import { describe, expect, it } from "vitest";
import { blocksXhtml, defaultOptions, layOut, linesOf, readingOrder, runningLines, type Block, type PdfItem, type PdfPage } from "../src/shared/pdf-layout";
import { readInfo, readMarks, readPage, type Ops } from "../src/renderer/src/lib/pdf-read";
import { makePdf, SAMPLE, sampleBook, typeset } from "./pdf-maker";

const labels = { start: "Opening", pages: (a: number, b: number) => `Pages ${a} to ${b}` };
const item = (text: string, x: number, y: number, extra: Partial<PdfItem> = {}): PdfItem => ({ text, x, y, width: text.length * 5.5, size: 11, ...extra });
const page = (number: number, items: PdfItem[], extra: Partial<PdfPage> = {}): PdfPage => ({ number, width: 420, height: 595, items, pictures: [], ...extra });
const words = (blocks: Block[]) => blocks.map((b) => (b.kind === "picture" ? "[picture]" : b.runs.map((r) => r.text).join("")));
const all = (laid: ReturnType<typeof layOut>) => laid.chapters.flatMap((c) => c.blocks);

describe("lines from pieces of text", () => {
  it("puts pieces on one baseline together, spaced as they sit", () => {
    const lines = linesOf(page(1, [item("world", 70, 100), item("Hello", 40, 100.5), item("Next", 40, 115)]));
    expect(lines.map((l) => l.text)).toEqual(["Hello world", "Next"]);
  });

  it("keeps a small raised number as a footnote mark", () => {
    const [line] = linesOf(page(1, [item("Salt.", 40, 100, { width: 25 }), item("3", 66, 96, { size: 6, width: 3 })]));
    expect(line.runs).toEqual([{ text: "Salt." }, { text: "3", sup: true }]);
  });

  it("keeps bold and italic, and folds ligatures and stray characters", () => {
    const [line] = linesOf(page(1, [item("ﬁne ", 40, 100, { bold: true }), item("print\u0007", 64, 100, { italic: true })]));
    expect(line.runs).toEqual([{ text: "fine ", bold: true }, { text: "print", italic: true }]);
  });

  it("splits a baseline into two lines where a gutter runs between them", () => {
    expect(linesOf(page(1, [item("left side", 40, 100), item("right side", 240, 100)])).map((l) => l.text)).toEqual(["left side", "right side"]);
  });
});

describe("the order a page reads in", () => {
  it("reads two columns down the left, then down the right, with a title across both first", () => {
    const left = [0, 1, 2, 3, 4].map((i) => item(`left ${i}`, 40, 120 + i * 15));
    const right = [0, 1, 2, 3, 4].map((i) => item(`right ${i}`, 230, 120 + i * 15));
    const lines = linesOf(page(1, [item("A Title Across Both Columns Of The Page", 40, 80, { size: 16, width: 330 }), ...left, ...right]));
    expect(readingOrder(lines, 420).map((l) => l.text)).toEqual(["A Title Across Both Columns Of The Page", "left 0", "left 1", "left 2", "left 3", "left 4", "right 0", "right 1", "right 2", "right 3", "right 4"]);
  });

  it("reads one column top to bottom", () => {
    const lines = linesOf(page(1, [item("second", 40, 115), item("first", 40, 100)]));
    expect(readingOrder(lines, 420).map((l) => l.text)).toEqual(["first", "second"]);
  });
});

describe("what every page repeats", () => {
  const book = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      page(i + 1, [item(i % 2 ? "THE SALT ROAD" : "Chapter One", 150, 30, { size: 8 }), item(`Body text on page ${i + 1}.`, 40, 300), item(String(i + 1), 205, 575, { size: 9 })]),
    );

  it("finds running heads and page numbers, and nothing in the body", () => {
    const read = book(8).map((p) => ({ page: p, lines: linesOf(p) }));
    const running = [...runningLines(read)].map((l) => l.text);
    expect(running).toContain("THE SALT ROAD");
    expect(running).toContain("Chapter One");
    expect(running).toContain("7");
    expect(running.some((t) => t.startsWith("Body text"))).toBe(false);
  });

  it.each(["12", "xiv", "- 12 -", "Page 3", "3 of 200", "Strana 4"])("takes %j at a page's foot for a page number", (number) => {
    const p = page(1, [item("Body.", 40, 300), item(number, 200, 580)]);
    expect([...runningLines([{ page: p, lines: linesOf(p) }])].map((l) => l.text)).toEqual([number]);
  });

  it("leaves them in when asked to", () => {
    const laid = layOut(book(6), [], { ...defaultOptions(6, false), tidy: false }, labels);
    expect(words(all(laid)).join(" ")).toContain("THE SALT ROAD");
    expect(layOut(book(6), [], defaultOptions(6, false), labels).tidied).toBe(12);
  });
});

describe("paragraphs", () => {
  const lines = (texts: string[], y = 100, extra: Partial<PdfItem> = {}) => texts.map((t, i) => item(t, 40, y + i * 14, { width: 330, ...extra }));

  it("joins lines into one paragraph, and a word broken with a hyphen back into one word", () => {
    const laid = layOut([page(1, lines(["The road ran down to the sea and the carts went extra-", "ordinarily slowly up the hill again in the evening light."]))], [], defaultOptions(1, false), labels);
    expect(words(all(laid))).toEqual(["The road ran down to the sea and the carts went extraordinarily slowly up the hill again in the evening light."]);
  });

  it("keeps a hyphen that belongs, before a capital, and leaves broken words alone when asked", () => {
    const keep = layOut([page(1, lines(["She sailed to the north of the island past Saint-", "Malo and the long bay where the boats were moored up."]))], [], defaultOptions(1, false), labels);
    expect(words(all(keep))[0]).toContain("Saint- Malo");
    const left = layOut([page(1, lines(["The carts went extra-", "ordinarily slowly up the hill again and again and again."]))], [], { ...defaultOptions(1, false), join: false }, labels);
    expect(words(all(left))[0]).toContain("extra- ordinarily");
  });

  it("starts a new paragraph at an indent, a gap, or a short line that ends a sentence", () => {
    const items = [
      ...lines(["First paragraph runs across the whole width of the column and on,", "and ends here."]),
      item("Second paragraph starts with an indent like books do and then runs on", 54, 128, { width: 316 }),
      item("across the column.", 40, 142, { width: 90 }),
      item("Third paragraph comes after a gap between them both.", 40, 175, { width: 330 }),
    ];
    expect(words(all(layOut([page(1, items)], [], defaultOptions(1, false), labels)))).toEqual([
      "First paragraph runs across the whole width of the column and on, and ends here.",
      "Second paragraph starts with an indent like books do and then runs on across the column.",
      "Third paragraph comes after a gap between them both.",
    ]);
  });

  it("carries a paragraph on over a page break, but not a finished one", () => {
    const pages = [page(1, lines(["A sentence that is not finished at the foot of the page and"])), page(2, lines(["carries on at the top of the next one."]))];
    expect(words(all(layOut(pages, [], defaultOptions(2, false), labels)))).toEqual(["A sentence that is not finished at the foot of the page and carries on at the top of the next one."]);
    const done = [page(1, lines(["A sentence that ends at the foot of the page."])), page(2, lines(["Another one begins on the next."]))];
    expect(words(all(layOut(done, [], defaultOptions(2, false), labels)))).toHaveLength(2);
  });

  it("makes a list of lines with bullets", () => {
    const laid = layOut([page(1, [item("• Salt", 40, 100), item("• Pepper", 40, 115)])], [], defaultOptions(1, false), labels);
    expect(all(laid).map((b) => b.kind)).toEqual(["li", "li"]);
    expect(blocksXhtml(all(laid), () => undefined)).toBe("<ul>\n<li>Salt</li>\n<li>Pepper</li>\n</ul>");
  });
});

describe("headings and chapters", () => {
  const chapter = (title: string, n: number) => page(n, [item(title, 40, 80, { size: 20, bold: true }), item(`Text of ${title}.`, 40, 120)]);

  it("takes bigger lines as headings, and a bold line on its own as a small one", () => {
    const laid = layOut([page(1, [item("Part One", 40, 60, { size: 24 }), item("Chapter", 40, 100, { size: 15 }), item("A bold aside", 40, 140, { bold: true }), item("Ordinary words.", 40, 160)])], [], defaultOptions(1, false), labels);
    expect(all(laid).map((b) => b.kind)).toEqual(["h1", "h2", "h3", "p"]);
    const flat = layOut([page(1, [item("Part One", 40, 60, { size: 24 }), item("Ordinary words.", 40, 100)])], [], { ...defaultOptions(1, false), headings: false }, labels);
    expect(all(flat).map((b) => b.kind)).toEqual(["p", "p"]);
  });

  it("joins a heading over two lines into one", () => {
    const laid = layOut([page(1, [item("A Very Long Title That", 40, 60, { size: 20 }), item("Runs Over Two Lines", 40, 84, { size: 20 }), item("Words.", 40, 130)])], [], defaultOptions(1, false), labels);
    expect(words(all(laid))[0]).toBe("A Very Long Title That Runs Over Two Lines");
  });

  it("begins chapters at bookmarks, named by them", () => {
    const pages = [page(1, [item("Front matter.", 40, 100)]), chapter("Chapter One", 2), chapter("Chapter Two", 3)];
    const laid = layOut(pages, [{ title: "Chapter One", page: 2, depth: 0 }, { title: "Chapter Two", page: 3, depth: 0 }, { title: "A section", page: 3, depth: 1 }], defaultOptions(3, true), labels);
    expect(laid.marked).toBe(true);
    expect(laid.chapters.map((c) => [c.title, c.first, c.last])).toEqual([["Opening", 1, 1], ["Chapter One", 2, 2], ["Chapter Two", 3, 3]]);
  });

  it("begins chapters at headings when there are no bookmarks", () => {
    const laid = layOut([chapter("One", 1), chapter("Two", 2), chapter("Three", 3)], [], defaultOptions(3, false), labels);
    expect(laid.marked).toBe(false);
    expect(laid.chapters.map((c) => c.title)).toEqual(["One", "Two", "Three"]);
  });

  it("begins one every few pages when asked, or when there's nothing else to go by", () => {
    const pages = Array.from({ length: 5 }, (_, i) => page(i + 1, [item(`Page ${i + 1} words.`, 40, 300)]));
    const laid = layOut(pages, [], { ...defaultOptions(5, false), chapters: "pages", every: 2 }, labels);
    expect(laid.chapters.map((c) => c.title)).toEqual(["Pages 1 to 2", "Pages 3 to 4", "Pages 5 to 5"]);
    expect(layOut(pages, [], defaultOptions(5, false), labels).chapters).toHaveLength(1);
  });

  it("takes only the pages asked for", () => {
    const laid = layOut([chapter("One", 1), chapter("Two", 2), chapter("Three", 3)], [], { ...defaultOptions(3, false), from: 2, to: 2 }, labels);
    expect(laid.chapters.map((c) => c.title)).toEqual(["Two"]);
  });
});

describe("pictures", () => {
  it("keeps a picture where it sits among the words, and a scanned page as a whole page", () => {
    const withPicture = page(1, [item("Above.", 40, 100), item("Below.", 40, 400)], { pictures: [{ x: 50, y: 150, width: 200, height: 150 }, { x: 10, y: 10, width: 4, height: 4 }] });
    expect(words(all(layOut([withPicture], [], defaultOptions(1, false), labels)))).toEqual(["Above.", "[picture]", "Below."]);
    expect(words(all(layOut([withPicture], [], { ...defaultOptions(1, false), pictures: false }, labels)))).toEqual(["Above.", "Below."]);
    const scan = layOut([page(1, [], { pictures: [{ x: 0, y: 0, width: 420, height: 595 }] })], [], defaultOptions(1, false), labels);
    expect(scan.scanned).toBe(true);
    expect(all(scan)[0]).toMatchObject({ kind: "picture", whole: true });
  });
});

describe("as XHTML", () => {
  it("escapes the words, and marks bold, italic and footnotes", () => {
    const blocks: Block[] = [{ kind: "p", page: 1, runs: [{ text: "Salt & <pepper> " }, { text: "bold", bold: true }, { text: " and " }, { text: "slanted", italic: true }, { text: "2", sup: true }] }];
    expect(blocksXhtml(blocks, () => undefined)).toBe("<p>Salt &amp; &lt;pepper&gt; <b>bold</b> and <i>slanted</i><sup>2</sup></p>");
  });
});

// pdf.js takes seconds to load the first time on a slow machine, like Windows CI.
describe("a real PDF, read through pdf.js", { timeout: 30_000 }, () => {
  const read = async (data: Uint8Array) => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data, fontExtraProperties: true, verbosity: 0 }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) pages.push(await readPage(doc, n, pdfjs.OPS as unknown as Ops));
    return { pages, marks: await readMarks(doc), info: await readInfo(doc) };
  };

  it("comes out as the book it is", async () => {
    const { pages, marks, info } = await read(sampleBook());
    expect(info).toEqual({ title: SAMPLE.title, author: SAMPLE.author });
    expect(marks).toEqual([{ title: "Chapter One", page: 2, depth: 0 }, { title: "Chapter Two", page: 5, depth: 0 }]);
    const laid = layOut(pages, marks, defaultOptions(pages.length, true), labels);
    // The title page comes first, under the book's own title.
    expect(laid.chapters.map((c) => c.title)).toEqual([SAMPLE.title, "Chapter One", "Chapter Two"]);
    const text = words(all(laid));
    // Paragraphs whole, broken words joined, no running heads or page numbers.
    expect(text).toContain(SAMPLE.one);
    expect(text).toContain(SAMPLE.two);
    expect(text).toContain(SAMPLE.three);
    expect(text).toContain(SAMPLE.four);
    expect(text).toContain(SAMPLE.five);
    expect(text.join(" ")).not.toMatch(/THE SALT ROAD/);
    expect(text.some((t) => /^\d+$/.test(t))).toBe(false);
    // The two columns read in order, the picture kept, the list a list.
    expect(text.indexOf(SAMPLE.left)).toBeGreaterThan(-1);
    expect(text.indexOf(SAMPLE.right)).toBe(text.indexOf(SAMPLE.left) + 1);
    expect(text).toContain("[picture]");
    expect(all(laid).filter((b) => b.kind === "li")).toHaveLength(2);
    const chapterOne = laid.chapters[1];
    expect(chapterOne.blocks[0]).toMatchObject({ kind: "h1" });
    expect(chapterOne.blocks.find((b) => b.kind === "h3")).toBeTruthy();
    const xhtml = blocksXhtml(chapterOne.blocks, () => "images/x.jpg");
    expect(xhtml).toContain("kept in <i>pencil</i> and checked");
    expect(xhtml).toContain("<sup>1</sup>");
  });

  it("makes chapters from headings when the PDF has no bookmarks", async () => {
    const { pages, marks } = await read(sampleBook({ marks: false }));
    const laid = layOut(pages, marks, defaultOptions(pages.length, false), labels);
    expect(laid.marked).toBe(false);
    expect(laid.chapters.map((c) => c.title)).toEqual([SAMPLE.title, "Chapter One", "Chapter Two"]);
  });

  it("copes with a page with nothing on it", async () => {
    const { pages } = await read(makePdf({ pages: [{ lines: [] }, { lines: typeset("Only words on the second page.", { y: 100 }) }] }));
    expect(words(all(layOut(pages, [], defaultOptions(2, false), labels)))).toEqual(["Only words on the second page."]);
  });
});
