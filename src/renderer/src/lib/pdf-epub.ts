import type { Book } from "../../../shared/types";
import { blocksXhtml, defaultOptions, layOut, PDF_CSS, type Block, type Laid, type PdfMark, type PdfOptions, type PdfPage } from "../../../shared/pdf-layout";
import { t } from "../../../shared/i18n";
import type { Content } from "./epub";
import { closePdf, drawPage, openPdf, OPS, type PdfDoc } from "./pdf";
import { readInfo, readMarks, readPage, type Ops } from "./pdf-read";

/*
 * A PDF made into a book's chapters: read once, laid out as often as the
 * choices change, and its pictures cut from the pages only when they're shown
 * or the book is made.
 */

export type PdfStudy = { doc: PdfDoc; pages: PdfPage[]; marks: PdfMark[]; title?: string; author?: string };

export type Picture = Extract<Block, { kind: "picture" }>;

/** What you changed about the chapters: new names, and the ones left out, by where each begins. */
export type ChapterEdits = { titles: Record<string, string>; skipped: string[] };

/** A chapter's place, the same however its name is changed. */
export const chapterKey = (chapter: { first: number; title: string }, index: number) => `${index}:${chapter.first}`;

export const pdfLabels = () => ({
  start: t("Before the first chapter"),
  pages: (first: number, last: number) => (first === last ? t("Page {page}", { page: String(first) }) : t("Pages {start} to {end}", { start: String(first), end: String(last) })),
});

/** Reads every page of a PDF, saying how far it's got: pages read, of how many. */
export async function studyPdf(data: ArrayBuffer | Uint8Array, onProgress?: (read: number, of: number) => void): Promise<PdfStudy> {
  const doc = await openPdf(data);
  try {
    const pages: PdfPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      pages.push(await readPage(doc, n, OPS as unknown as Ops));
      onProgress?.(n, doc.numPages);
    }
    const [marks, info] = await Promise.all([readMarks(doc), readInfo(doc)]);
    return { doc, pages, marks, ...info };
  } catch (error) {
    closePdf(doc);
    throw error;
  }
}

export const closeStudy = (study: PdfStudy | null | undefined) => closePdf(study?.doc);

export const layOutPdf = (study: PdfStudy, options: PdfOptions) => layOut(study.pages, study.marks, options, pdfLabels());

export const startingOptions = (study: PdfStudy) => defaultOptions(study.pages.length, study.marks.filter((m) => m.depth === 0).length >= 2);

/** The largest a picture is made, along its longer side, in pixels. */
const LARGEST = 1600;
const drawn = new WeakMap<PdfStudy, Map<number, Promise<HTMLCanvasElement>>>();

/** A picture cut from its page as a JPEG, drawn at twice the PDF's size or as near as fits. */
export async function cutPicture(study: PdfStudy, block: Picture): Promise<Blob> {
  const { picture } = block;
  const scale = Math.min(2, LARGEST / Math.max(picture.width, picture.height));
  let pages = drawn.get(study);
  if (!pages) drawn.set(study, (pages = new Map()));
  // Pages drawn are kept a while, since one page often has several pictures.
  if (!pages.has(block.page)) pages.set(block.page, drawPage(study.doc, block.page, scale));
  if (pages.size > 6) pages.delete(pages.keys().next().value!);
  const page = await pages.get(block.page)!;
  const ratio = page.width / study.pages[block.page - 1].width;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(picture.width * ratio));
  out.height = Math.max(1, Math.round(picture.height * ratio));
  out.getContext("2d")!.drawImage(page, picture.x * ratio, picture.y * ratio, out.width, out.height, 0, 0, out.width, out.height);
  return new Promise((resolve, reject) => out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No picture"))), "image/jpeg", 0.88));
}

/** The book, as an EPUB's content: the chapters kept, under their names, with their pictures. */
export async function pdfContent(study: PdfStudy, laid: Laid, edits: ChapterEdits, base: Content, onProgress?: (share: number) => void): Promise<Content> {
  const content: Content = { ...base, chapters: [], images: new Map(base.images), css: `${base.css}\n${PDF_CSS}` };
  const kept = laid.chapters.map((chapter, i) => ({ chapter, key: chapterKey(chapter, i) })).filter(({ key }) => !edits.skipped.includes(key));
  const pictures = kept.flatMap(({ chapter }) => chapter.blocks.filter((b): b is Picture => b.kind === "picture"));
  const paths = new Map<Picture, string>();
  for (const [i, picture] of pictures.entries()) {
    const blob = await cutPicture(study, picture);
    const path = `images/page${picture.page}-${i + 1}.jpg`;
    content.images.set(path, { data: new Uint8Array(await blob.arrayBuffer()), type: "image/jpeg" });
    paths.set(picture, path);
    onProgress?.((i + 1) / Math.max(1, pictures.length));
  }
  for (const { chapter, key } of kept) {
    const title = edits.titles[key]?.trim() || chapter.title;
    const xhtml = blocksXhtml(chapter.blocks, (b) => paths.get(b));
    // A chapter that doesn't open with its own heading gets its name at the top.
    const opens = chapter.blocks[0]?.kind === "h1" || chapter.blocks[0]?.kind === "h2";
    content.chapters.push({ title, xhtml: opens ? xhtml : `<h2>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</h2>\n${xhtml}`, toc: true });
  }
  return content;
}

/** A PDF as an EPUB's content with every choice left as it starts: what converting without asking makes. */
export async function plainPdfContent(book: Book, data: ArrayBuffer, base: Content, onProgress?: (share: number) => void) {
  const study = await studyPdf(data, (read, of) => onProgress?.((read / of) * 0.7));
  try {
    const laid = layOutPdf(study, startingOptions(study));
    return await pdfContent(study, laid, { titles: {}, skipped: [] }, { ...base, title: base.title || study.title || book.title }, (share) => onProgress?.(0.7 + share * 0.3));
  } finally {
    closeStudy(study);
  }
}
