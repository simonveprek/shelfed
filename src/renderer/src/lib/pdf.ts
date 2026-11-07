import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = worker;

/** The drawing operations, by number, for reading where pictures go. */
export const OPS = pdfjs.OPS;

const tasks = new WeakMap<object, { destroy: () => Promise<void> }>();

export async function openPdf(data: ArrayBuffer | Uint8Array) {
  // Fonts keep their names, which say bold or italic, for turning a PDF into a book.
  const task = pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data), fontExtraProperties: true, verbosity: 0 });
  const doc = await task.promise;
  tasks.set(doc, task);
  return doc;
}

export type PdfDoc = Awaited<ReturnType<typeof openPdf>>;

/** Lets go of a document and its worker. */
export function closePdf(doc: PdfDoc | null | undefined) {
  if (doc) void tasks.get(doc)?.destroy();
}

/** A page drawn on a canvas, scale times its size in points. */
export async function drawPage(doc: PdfDoc, n: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** A page drawn as a picture, for a cover. */
export async function renderPage(doc: PdfDoc, n: number, width: number): Promise<Blob | null> {
  const page = await doc.getPage(n);
  const canvas = await drawPage(doc, n, width / page.getViewport({ scale: 1 }).width);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}
