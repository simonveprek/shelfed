import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = worker;

const tasks = new WeakMap<object, { destroy: () => Promise<void> }>();

export async function openPdf(data: ArrayBuffer | Uint8Array) {
  const task = pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data) });
  const doc = await task.promise;
  tasks.set(doc, task);
  return doc;
}

export type PdfDoc = Awaited<ReturnType<typeof openPdf>>;

/** Lets go of a document and its worker. */
export function closePdf(doc: PdfDoc | null | undefined) {
  if (doc) void tasks.get(doc)?.destroy();
}

/** A page drawn as a picture, for a cover. */
export async function renderPage(doc: PdfDoc, n: number, width: number): Promise<Blob | null> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

/**
 * A page's words as paragraphs. Lines are rebuilt from where each piece
 * sits, and a wider gap than usual between lines starts a new paragraph.
 */
export async function pageParagraphs(doc: PdfDoc, n: number): Promise<string[]> {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  type Line = { y: number; h: number; text: string };
  const lines: Line[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = item.transform[5];
    const h = Math.abs(item.transform[3]) || 10;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) < h * 0.5) last.text += (item.hasEOL ? " " : "") + item.str;
    else lines.push({ y, h, text: item.str });
  }
  const paragraphs: string[] = [];
  let current = "";
  lines.forEach((line, i) => {
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!text) return;
    const gap = i ? lines[i - 1].y - line.y : 0;
    const ends = /[.!?"”]$/.test(current) && /^[A-Z“"]/.test(text);
    if (current && (gap > line.h * 1.8 || (ends && gap > line.h * 1.35))) {
      paragraphs.push(current);
      current = "";
    }
    // Words broken over a line with a hyphen join back up.
    current = current.endsWith("-") ? current.slice(0, -1) + text : current ? `${current} ${text}` : text;
  });
  if (current) paragraphs.push(current);
  return paragraphs.filter((p) => !/^\d{1,4}$/.test(p));
}
