import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";

/**
 * Ebooks, as opposed to everything else a Downloads folder fills with. PDFs,
 * Word files and text are mostly invoices and documents there, so they stay.
 */
export const DOWNLOADED_BOOKS = ["epub", "mobi", "azw3", "azw", "kf8", "fb2", "fbz", "cbz"];

/** How long a download has to stay the same size before it counts as finished. */
const SETTLED = 1500;

/**
 * Watches a folder for ebooks arriving while Shelfed is open, and hands them
 * over once each has finished downloading, a few at a time. Browsers write a
 * download under a name of their own (.crdownload, .part) and rename it when
 * done; that rename is what brings it here. Returns a function that stops.
 */
export function watchDownloads(folder: string, arrived: (paths: string[]) => void): () => void {
  const waiting = new Map<string, NodeJS.Timeout>();
  const handed = new Set<string>();
  let batch: string[] = [];
  let flush: NodeJS.Timeout | undefined;

  const ready = (path: string) => {
    batch.push(path);
    clearTimeout(flush);
    flush = setTimeout(() => {
      const paths = batch;
      batch = [];
      arrived(paths);
    }, 800);
  };

  // Ready once it exists, isn't empty, and its size has stopped changing.
  const check = (path: string, last = -1) => {
    clearTimeout(waiting.get(path));
    waiting.set(
      path,
      setTimeout(async () => {
        waiting.delete(path);
        const info = await stat(path).catch(() => null);
        if (!info?.isFile() || info.size === 0) return;
        if (info.size !== last) return check(path, info.size);
        const key = `${path}:${info.size}:${info.mtimeMs}`;
        if (handed.has(key)) return;
        handed.add(key);
        ready(path);
      }, SETTLED),
    );
  };

  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(folder, (_event, name) => {
      if (!name) return;
      const file = name.toString();
      if (file.startsWith(".") || file.startsWith("~$")) return;
      if (!DOWNLOADED_BOOKS.includes(extname(file).slice(1).toLowerCase())) return;
      check(join(folder, file));
    });
    watcher.on("error", () => watcher?.close());
  } catch {
    // No Downloads folder, or one that can't be watched: nothing to do.
  }
  return () => {
    watcher?.close();
    for (const timer of waiting.values()) clearTimeout(timer);
    clearTimeout(flush);
  };
}
