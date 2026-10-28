import { BrowserWindow } from "electron";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Inches. The Kindle size is a Paperwhite's screen, so pages fill it.
const PAGES: Record<string, { pageSize: Electron.PrintToPDFOptions["pageSize"]; margin: number }> = {
  A4: { pageSize: "A4", margin: 0.65 },
  A5: { pageSize: "A5", margin: 0.55 },
  Letter: { pageSize: "Letter", margin: 0.65 },
  Kindle: { pageSize: { width: 3.6, height: 4.8 }, margin: 0.2 },
};

/** Lays an HTML book out in a hidden window and prints it to PDF. */
export async function htmlToPdf(html: string, page: string): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "shelf-"));
  const file = join(dir, "book.html");
  await writeFile(file, html);
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, javascript: false, sandbox: true } });
  try {
    await win.loadURL(pathToFileURL(file).href);
    // Pictures decode after load, so give them a moment.
    await new Promise((r) => setTimeout(r, 400));
    const { pageSize, margin } = PAGES[page] ?? PAGES.A5;
    const pdf = await win.webContents.printToPDF({
      pageSize,
      printBackground: true,
      margins: { top: margin, bottom: margin, left: margin, right: margin },
      generateDocumentOutline: true,
      generateTaggedPDF: true,
    });
    return new Uint8Array(pdf);
  } finally {
    win.destroy();
    // Windows may still hold the file a moment after printing; the PDF is made either way.
    await rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}

/** A Word document as clean HTML, pictures inline. */
export async function docxToHtml(path: string): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ buffer: await readFile(path) });
  return result.value;
}
