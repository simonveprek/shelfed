import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfItem, PdfMark, PdfPage, PdfPicture } from "../../../shared/pdf-layout";

/*
 * Reads a PDF's pages for the layout to work on: each piece of text where it
 * sits, at its size, bold or italic from its font; where each picture is
 * drawn; the bookmarks and the page each goes to. It takes an open document,
 * so the same code runs in the window and in the tests.
 */

/** The drawing operations it follows, as pdf.js numbers them. */
export type Ops = { save: number; restore: number; transform: number; paintImageXObject: number; paintInlineImageXObject: number; paintImageMaskXObject: number; paintFormXObjectBegin: number; paintFormXObjectEnd: number };

type Matrix = [number, number, number, number, number, number];
const times = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

type Font = { name?: string; bold?: boolean; italic?: boolean; black?: boolean };

/** One page, read. */
export async function readPage(doc: PDFDocumentProxy, number: number, ops: Ops): Promise<PdfPage> {
  const page = await doc.getPage(number);
  const [x0, y0, x1, y1] = page.view;
  const width = x1 - x0;
  const height = y1 - y0;
  // The drawing list first: it loads the fonts, whose names say bold or italic, and says where pictures go.
  const list = await page.getOperatorList();
  const pictures: PdfPicture[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm;
    else if (fn === ops.transform) ctm = times(ctm, args as Matrix);
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args[0]) && args[0].length === 6) ctm = times(ctm, args[0] as Matrix);
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject || fn === ops.paintImageMaskXObject) {
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]]);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const left = Math.max(x0, Math.min(...xs));
      const right = Math.min(x1, Math.max(...xs));
      const bottom = Math.max(y0, Math.min(...ys));
      const top = Math.min(y1, Math.max(...ys));
      if (right - left > 1 && top - bottom > 1) pictures.push({ x: left - x0, y: y1 - top, width: right - left, height: top - bottom });
    }
  }

  const content = await page.getTextContent();
  const fonts = new Map<string, Font | null>();
  const fontOf = (name: string) => {
    if (!fonts.has(name)) fonts.set(name, page.commonObjs.has(name) ? (page.commonObjs.get(name) as Font) : null);
    return fonts.get(name);
  };
  const items: PdfItem[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;
    const [a, b, c, d, e, f] = item.transform as Matrix;
    // Turned text, like a sideways caption, isn't part of the reading.
    if (Math.abs(b) > Math.abs(a) * 0.1 || Math.abs(c) > Math.abs(d) * 0.1) continue;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const font = fontOf(item.fontName);
    const name = font?.name ?? "";
    items.push({
      text: item.str,
      x: e - x0,
      y: y1 - f,
      width: item.width,
      size,
      bold: Boolean(font?.bold || font?.black || /bold|black|heavy|semibold|demi/i.test(name)),
      italic: Boolean(font?.italic || /italic|oblique/i.test(name)),
    });
  }
  page.cleanup();
  return { number, width, height, items, pictures };
}

type Outline = Array<{ title: string; dest: string | unknown[] | null; items: Outline }>;

/** The bookmarks, each with the page it goes to and how deep it sits. */
export async function readMarks(doc: PDFDocumentProxy): Promise<PdfMark[]> {
  const outline = ((await doc.getOutline().catch(() => null)) ?? []) as Outline;
  const marks: PdfMark[] = [];
  const walk = async (items: Outline, depth: number) => {
    for (const item of items) {
      try {
        const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
        const target = Array.isArray(dest) ? dest[0] : null;
        const index = typeof target === "number" ? target : target && typeof target === "object" ? await doc.getPageIndex(target as Parameters<typeof doc.getPageIndex>[0]) : null;
        if (index !== null && item.title?.trim()) marks.push({ title: item.title.replace(/\s+/g, " ").trim(), page: index + 1, depth });
      } catch {
        // A bookmark that goes nowhere is left out.
      }
      if (item.items?.length) await walk(item.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return marks;
}

/** What the PDF says it's called and who wrote it. */
export async function readInfo(doc: PDFDocumentProxy) {
  const info = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as { Title?: unknown; Author?: unknown };
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return { title: text(info.Title), author: text(info.Author) };
}
