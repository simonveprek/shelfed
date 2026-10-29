import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** A Calibre library on this computer: where it is and how many books it holds. */
export type CalibreLibrary = { path: string; books: number };

/** Where Calibre keeps its own settings, on each system. SHELF_CALIBRE_CONFIG points the tests elsewhere. */
function configFolder() {
  if (process.env.SHELF_CALIBRE_CONFIG) return process.env.SHELF_CALIBRE_CONFIG;
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "calibre");
  if (process.platform === "darwin") return join(homedir(), "Library", "Preferences", "calibre");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "calibre");
}

const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8").catch(() => "{}")) as Record<string, unknown>;

/** Books in a Calibre library: a folder per author, a folder per book, each with its metadata.opf. */
async function countBooks(library: string) {
  let count = 0;
  for (const author of await readdir(library, { withFileTypes: true }).catch(() => [])) {
    if (!author.isDirectory() || author.name.startsWith(".")) continue;
    for (const book of await readdir(join(library, author.name), { withFileTypes: true }).catch(() => [])) {
      if (book.isDirectory() && existsSync(join(library, author.name, book.name, "metadata.opf"))) count++;
    }
  }
  return count;
}

/**
 * The Calibre libraries on this computer, the one Calibre opens first, first.
 * Calibre writes where they are into its settings: the current one in
 * global.py.json, and every one it has opened in gui.json. Its default folder
 * counts too. Only folders still holding a Calibre library, with books in
 * them, are given.
 */
export async function findCalibre(): Promise<CalibreLibrary[]> {
  const config = configFolder();
  const global = await readJson(join(config, "global.py.json"));
  const gui = await readJson(join(config, "gui.json"));
  const used = gui.library_usage_stats && typeof gui.library_usage_stats === "object" ? Object.keys(gui.library_usage_stats) : [];
  // Calibre's own default, unless the tests point elsewhere.
  const fallback = process.env.SHELF_CALIBRE_CONFIG ? [] : [join(homedir(), "Calibre Library")];
  const candidates = [global.library_path, ...used, ...fallback]
    .filter((path): path is string => typeof path === "string" && path.length > 0)
    .map((path) => resolve(path));
  const out: CalibreLibrary[] = [];
  for (const path of [...new Set(candidates)]) {
    if (!existsSync(join(path, "metadata.db"))) continue;
    const books = await countBooks(path);
    if (books) out.push({ path, books });
  }
  return out;
}
