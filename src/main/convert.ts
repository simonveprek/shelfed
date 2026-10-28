import { BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Where Calibre's converter usually lives, so it is found without asking. */
export function findCalibre(custom?: string): string | null {
  const candidates = [
    custom,
    "/Applications/calibre.app/Contents/MacOS/ebook-convert",
    join(process.env.HOME ?? "", "Applications/calibre.app/Contents/MacOS/ebook-convert"),
    "C:\\Program Files\\Calibre2\\ebook-convert.exe",
    "C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe",
    join(process.env.LOCALAPPDATA ?? "", "Programs\\Calibre2\\ebook-convert.exe"),
    "/usr/bin/ebook-convert",
    "/opt/calibre/ebook-convert",
  ].filter(Boolean) as string[];
  return candidates.find((path) => existsSync(path)) ?? null;
}

/** Runs Calibre's ebook-convert, reporting its percentages as it goes. */
export function calibreConvert(
  bin: string,
  input: string,
  output: string,
  onProgress: (share: number, line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [input, output], { windowsHide: true });
    let tail = "";
    const read = (chunk: Buffer) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-2000);
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^(\d+)%\s+(.*)$/);
        if (match) onProgress(Number(match[1]) / 100, match[2]);
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && existsSync(output)) resolve();
      else reject(new Error(tail.trim().split("\n").slice(-3).join(" ") || `Calibre stopped with code ${code}`));
    });
  });
}

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
    await rm(dir, { recursive: true, force: true });
  }
}

/** A Word document as clean HTML, pictures inline. */
export async function docxToHtml(path: string): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ buffer: await readFile(path) });
  return result.value;
}

export async function tempPath(name: string) {
  const dir = await mkdtemp(join(tmpdir(), "shelf-"));
  return join(dir, name);
}
