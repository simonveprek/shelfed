import { shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import type { Book, Collection } from "../shared/types";
import { READABLE } from "../shared/types";
import { personNames } from "../shared/names";
import { seriesFix } from "../shared/series";
import { inherit } from "../shared/copies";
import { t } from "../shared/i18n";

/** `tidied`: which of the one-off fixes in open() a library has had. */
type Data = { version: 1; tidied?: number; books: Book[]; collections: Collection[] };
/** Names turned round and series out of titles; raised when open() learns another. */
const TIDIED = 1;

const DB = "library.json";
/** A copy of the library file from the last good start, at most a day old. */
const BACKUP = "library.backup.json";

export const newId = (n = 10) => randomBytes(n).toString("base64url").replace(/[-_]/g, "x").slice(0, n);

/** Names Windows keeps for devices, which no file or folder may have, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/** Keeps names safe on every file system Windows and macOS have. */
export function safeName(name: string, max = 80) {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    // Windows can't open a name ending in a dot or a space, even one cut short here.
    .replace(/[. ]+$/, "")
    .trim();
  const named = clean || "Unknown";
  return RESERVED.test(named) ? `${named}_` : named;
}

/** Windows paths stop working past 260 characters in many places, so names there are kept shorter. */
const SHORT = process.platform === "win32";
const LIMIT = SHORT ? { author: 40, title: 50, file: 60 } : { author: 60, title: 70, file: 110 };

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha1");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/** A readable title from a file name, before the file itself is read. */
const titleFromFile = (path: string) =>
  basename(path, extname(path)).replace(/_+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Runs a file step again when it fails for a moment. Imports run side by
 * side, and one book leaving a folder can empty it just as another arrives.
 * On Windows, antivirus, search indexing, OneDrive or a preview often hold
 * a file for a moment, and a rename then fails until they let go.
 */
async function withFolder<T>(step: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await step();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      // macOS reports a folder that vanished halfway through mkdir as ENOTDIR.
      const vanished = code === "ENOENT" || code === "ENOTDIR";
      const locked = code === "EPERM" || code === "EACCES" || code === "EBUSY";
      if ((!vanished && !locked) || attempt >= 6) throw error;
      if (locked) await new Promise((r) => setTimeout(r, 40 * 2 ** attempt));
    }
  }
}

/**
 * Sends a folder to the system Trash. The app tests, run on someone's own
 * computer, delete instead, so their Trash doesn't fill with test books; CI
 * uses the real Trash, as people do.
 */
const toTrash = (dir: string) => (process.env.SHELF_NO_TRASH ? rm(dir, { recursive: true, force: true }) : shell.trashItem(dir));

/**
 * Sends a folder to the Trash, giving up after a while: on Windows a move to
 * the Recycle Bin can wait forever on a file something else holds. A folder
 * that won't go is left where it is, never deleted outright.
 */
async function trashOrLeave(dir: string, report: (message: string, error?: unknown) => void, ms = 15_000) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      toTrash(dir),
      new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`No answer from the Trash after ${ms / 1000} s`)), ms))),
    ]);
  } catch (error) {
    report(`Left ${dir} in the library; it couldn't go to the Trash`, error);
  } finally {
    clearTimeout(timer);
  }
}

/** A path inside the library as it's stored, with forward slashes on every system, so a library moves between Mac and PC. */
const stored = (...parts: string[]) => parts.join("/");

/** System files that keep a folder from looking empty. */
const LITTER = [".DS_Store", "Thumbs.db", "desktop.ini"];

/** Folders that are never books, or that Windows won't let anyone read. */
const SKIP = /^(\$RECYCLE\.BIN|System Volume Information|My Music|My Pictures|My Videos)$/i;

/** Which of a book's files to read it from first, when it comes in several. */
const PREFERRED = ["epub", "azw3", "kf8", "mobi", "azw", "fb2", "fbz", "docx", "pdf", "cbz", "html", "htm", "xhtml", "md", "markdown", "txt", "prc"];

/** A file's format, by its extension, with the long spellings made short. */
function formatOf(path: string) {
  const raw = extname(path).slice(1).toLowerCase();
  return raw === "htm" ? "html" : raw === "markdown" ? "md" : raw;
}

const baseName = (book: Book) => safeName(`${book.title}${book.authors[0] ? ` - ${book.authors[0]}` : ""}`, LIMIT.file);

export class Library {
  root: string;
  books = new Map<string, Book>();
  collections: Collection[] = [];
  /** Books removed but still undoable, by id. */
  private pending = new Map<string, NodeJS.Timeout>();
  private saveTimer: NodeJS.Timeout | null = null;
  /** Files being copied in right now, by content, so the same file twice at once is one book. */
  private importing = new Map<string, Promise<{ book: Book; duplicate: boolean }>>();
  onSaveError?: (error: unknown) => void;
  /** Where the library notes what it did and what went wrong, for the log. */
  report: (message: string, error?: unknown) => void = (message, error) => console.warn(message, error ?? "");
  private saving = Promise.resolve();

  constructor(root: string) {
    // One spelling of the folder, so checks on what's inside it hold on every system.
    this.root = resolve(root);
  }

  async open() {
    await mkdir(this.root, { recursive: true });
    const path = join(this.root, DB);
    const backup = join(this.root, BACKUP);
    const read = (file: string) => {
      const data = JSON.parse(readFileSync(file, "utf8")) as Data;
      if (!Array.isArray(data.books)) throw new Error("Not a library file");
      return data;
    };
    let data: Data | null = null;
    if (existsSync(path)) {
      try {
        data = read(path);
      } catch {
        // A broken file is kept aside, never overwritten, and the backup takes its place.
        await rename(path, `${path}.broken-${Date.now()}`);
        if (existsSync(backup)) data = (() => { try { return read(backup); } catch { return null; } })();
      }
    }
    if (data) {
      for (const book of data.books) this.books.set(book.id, book);
      this.collections = data.collections ?? [];
      // Books added before names were turned round, or with their series still in
      // the title, put right once, folders and all. Only once: a title written
      // that way on purpose afterwards stays as it was written.
      const turned = (data.tidied ?? 0) >= TIDIED ? [] : data.books.filter((book) => {
        let changed = false;
        const names = personNames(book.authors);
        if (names.join("\n") !== book.authors.join("\n")) {
          book.authors = names;
          changed = true;
        }
        const series = seriesFix(book);
        if (series) {
          Object.assign(book, series);
          changed = true;
        }
        return changed;
      });
      for (const book of turned) await this.place(book).catch(() => {});
      if ((data.tidied ?? 0) < TIDIED) this.save();
      // A fresh backup once a day, from a file that just loaded cleanly.
      const age = existsSync(backup) ? Date.now() - statSync(backup).mtimeMs : Infinity;
      if (age > 86_400_000 && existsSync(path)) await copyFile(path, backup).catch(() => {});
    }
    return this;
  }

  list() {
    return [...this.books.values()].filter((b) => !this.pending.has(b.id));
  }

  get(id: string) {
    const book = this.books.get(id);
    if (!book) throw new Error(t("That book is no longer in the library."));
    return book;
  }

  /** Writes at most a few times a second, however much changes. */
  save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const data: Data = { version: 1, tidied: TIDIED, books: this.list(), collections: this.collections };
    const json = JSON.stringify(data);
    const path = join(this.root, DB);
    this.saving = this.saving
      .then(async () => {
        await writeFile(path + ".tmp", json);
        await withFolder(() => rename(path + ".tmp", path));
      })
      .catch((error) => {
        // The library in memory stays whole and the next change tries again.
        console.error("Could not save the library", error);
        this.onSaveError?.(error);
      });
    return this.saving;
  }

  /** Saves at once and waits for nothing, for when Windows is shutting down. */
  flushNow() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const path = join(this.root, DB);
    try {
      writeFileSync(path + ".tmp", JSON.stringify({ version: 1, tidied: TIDIED, books: this.list(), collections: this.collections } satisfies Data));
      renameSync(path + ".tmp", path);
    } catch (error) {
      console.error("Could not save the library", error);
    }
  }

  bookDir(book: Book) {
    return join(this.root, book.dir);
  }

  /**
   * A book's folder, for sending to the Trash, only when it's safe to: a folder
   * inside the library, not the library itself, and holding no other book.
   * Anything else throws, and nothing is removed.
   */
  private ownFolder(book: Book) {
    const dir = resolve(this.bookDir(book));
    const inside = relative(resolve(this.root), dir);
    if (!book.dir || !inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error(`Not a book's own folder: ${dir}`);
    for (const other of this.books.values()) {
      if (other.id === book.id) continue;
      const theirs = relative(dir, resolve(this.bookDir(other)));
      if (!theirs || !theirs.startsWith("..")) throw new Error(`${dir} also holds ${other.title}`);
    }
    return dir;
  }

  filePath(book: Book, ext?: string) {
    const format = ext ? book.formats.find((f) => f.ext === ext) : book.formats[0];
    if (!format) throw new Error(t("This book has no {format} file.", { format: String(ext?.toUpperCase()) }));
    return join(this.bookDir(book), format.file);
  }

  /**
   * The books under the given paths, folders searched through, each as its
   * files, the best one to read first. One book's formats travel together: a
   * folder Calibre keeps for one book (it holds a metadata.opf) is one book,
   * and so are files sharing a name in one folder, like Emma.epub and Emma.mobi.
   */
  async collectBooks(paths: string[]): Promise<string[][]> {
    const byDir = new Map<string, string[]>();
    for (const file of await this.collect(paths)) byDir.set(dirname(file), [...(byDir.get(dirname(file)) ?? []), file]);
    const groups = new Map<string, string[]>();
    for (const [dir, files] of byDir) {
      // A Calibre book's folder holds one book, at most one file of each format;
      // a folder with two EPUBs and a metadata.opf is books side by side.
      const exts = files.map((file) => extname(file).toLowerCase());
      const calibre = new Set(exts).size === exts.length && existsSync(join(dir, "metadata.opf"));
      for (const file of files) {
        const key = calibre ? `${dir}\0` : join(dir, basename(file, extname(file)).toLowerCase());
        groups.set(key, [...(groups.get(key) ?? []), file]);
      }
    }
    const rank = (file: string) => {
      const at = PREFERRED.indexOf(extname(file).slice(1).toLowerCase());
      return at < 0 ? PREFERRED.length : at;
    };
    return [...groups.values()].map((files) => files.sort((a, b) => rank(a) - rank(b)));
  }

  /** Every readable file under the given paths, folders searched through. */
  async collect(paths: string[]): Promise<string[]> {
    const out: string[] = [];
    const walk = async (path: string, depth: number) => {
      const info = await stat(path).catch(() => null);
      if (!info) return;
      if (info.isDirectory()) {
        if (depth > 8 || basename(path).startsWith(".") || SKIP.test(basename(path))) return;
        // A folder that can't be read is passed over, not a reason to stop.
        for (const name of await readdir(path).catch(() => [] as string[])) await walk(join(path, name), depth + 1);
      } else {
        const ext = extname(path).slice(1).toLowerCase();
        if (READABLE.includes(ext) && !basename(path).startsWith("._")) out.push(path);
      }
    };
    for (const path of paths) await walk(path, 0);
    return out;
  }

  /**
   * Copies a file in. A file already in the library is skipped. The book
   * waits under Incoming until its details are read, then place() moves it
   * to Author/Title.
   */
  async importFile(src: string): Promise<{ book: Book; duplicate: boolean }> {
    const hash = await hashFile(src);
    const existing = [...this.books.values()].find((b) => b.hash === hash);
    if (existing) return { book: existing, duplicate: true };
    const inflight = this.importing.get(hash);
    if (inflight) return inflight.then(({ book }) => ({ book, duplicate: true }));
    const job = this.copyIn(src, hash);
    this.importing.set(hash, job);
    try {
      return await job;
    } finally {
      this.importing.delete(hash);
    }
  }

  private async copyIn(src: string, hash: string): Promise<{ book: Book; duplicate: boolean }> {
    const ext = formatOf(src);
    const id = newId();
    const title = titleFromFile(src);
    const dir = stored("Incoming", id);
    const file = `${safeName(title, LIMIT.file)}.${ext}`;
    await withFolder(async () => {
      await mkdir(join(this.root, dir), { recursive: true });
      await copyFile(src, join(this.root, dir, file));
    });
    const { size } = await stat(src);
    const now = Date.now();
    const book: Book = {
      id, title, authors: [], tags: [], collections: [], rating: 0, status: "unread", favorite: false,
      formats: [{ ext, file, size }], dir, cover: 0, added: now, modified: now, hash,
    };
    this.books.set(id, book);
    this.save();
    return { book, duplicate: false };
  }

  /** Moves a book's folder and files to match its author and title. */
  async place(book: Book) {
    const author = safeName(book.authors[0] || "Unknown Author", LIMIT.author);
    const wanted = stored(author, `${safeName(book.title || "Untitled", LIMIT.title)} (${book.id.slice(0, 4)})`);
    if (wanted !== book.dir) {
      const to = join(this.root, wanted);
      if (!existsSync(to)) {
        const old = join(this.root, book.dir);
        await withFolder(async () => {
          await mkdir(dirname(to), { recursive: true });
          await rename(old, to);
        });
        book.dir = wanted;
        await this.tidy(dirname(old));
      }
    }
    for (const format of book.formats) {
      const name = `${baseName(book)}.${format.ext}`;
      const dir = this.bookDir(book);
      if (format.file !== name && !existsSync(join(dir, name))) {
        await withFolder(() => rename(join(dir, format.file), join(dir, name))).catch(() => {});
        if (existsSync(join(dir, name))) format.file = name;
      }
    }
  }

  /**
   * Removes a folder left empty behind, never the library itself. It never
   * deletes recursively: another import may be copying into the same folder
   * at this moment, and rmdir refuses a folder that is not empty, so a book
   * arriving in between is always kept.
   */
  private async tidy(dir: string) {
    const inside = relative(this.root, dir);
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) return;
    for (const litter of LITTER) await rm(join(dir, litter), { force: true }).catch(() => {});
    await rmdir(dir).catch(() => {});
  }

  async update(id: string, patch: Partial<Book>, relocate = false) {
    const book = this.get(id);
    const { id: _id, dir: _dir, formats: _formats, ...rest } = patch;
    // The day a book is finished is kept, for the year's count.
    if (rest.status === "finished" && book.status !== "finished") rest.finishedAt ??= Date.now();
    if (rest.status && rest.status !== "finished") rest.finishedAt = undefined;
    // Names turned round, wherever they came from: "Flanagan, John" is John Flanagan.
    if (rest.authors) rest.authors = personNames(rest.authors);
    Object.assign(book, rest, { modified: Date.now() });
    if (relocate) await this.place(book).catch(() => {});
    this.save();
    return book;
  }

  async setCover(id: string, cover: Uint8Array, thumb: Uint8Array, tint?: string) {
    const book = this.get(id);
    await writeFile(join(this.bookDir(book), "cover.jpg"), cover);
    await writeFile(join(this.bookDir(book), "thumb.jpg"), thumb);
    book.cover = Date.now();
    if (tint) book.tint = tint;
    book.modified = Date.now();
    this.save();
    return book;
  }

  async addFormat(id: string, ext: string, data: Uint8Array | string) {
    const book = this.get(id);
    if (book.formats.some((f) => f.ext === ext)) throw new Error(t("This book already has an {format}. Remove it first to make a new one.", { format: ext.toUpperCase() }));
    // Any file already sitting under that name is left alone, and the new one takes the next free name.
    let file = `${baseName(book)}.${ext}`;
    for (let n = 2; existsSync(join(this.bookDir(book), file)); n++) file = `${baseName(book)} (${n}).${ext}`;
    const path = join(this.bookDir(book), file);
    if (typeof data === "string") await copyFile(data, path);
    else await writeFile(path, data);
    const { size } = await stat(path);
    book.formats = [...book.formats.filter((f) => f.ext !== ext), { ext, file, size }];
    book.modified = Date.now();
    this.save();
    return book;
  }

  /**
   * Another file of the same book, added as one more of its formats. If that
   * file came in before as a book of its own, as it did when each format
   * arrived separately, that book is folded into this one.
   */
  async joinFile(id: string, src: string): Promise<{ book: Book; folded?: string }> {
    const book = this.get(id);
    const ext = formatOf(src);
    const hash = await hashFile(src);
    const twin = this.list().find((b) => b.id !== id && b.hash === hash);
    if (twin) {
      // The twin's notes, progress and the rest come along, as when copies are joined by hand.
      await this.update(id, inherit(book, [twin]));
      return { book: await this.merge(twin.id, id), folded: twin.id };
    }
    if (book.formats.some((f) => f.ext === ext)) return { book };
    return { book: await this.addFormat(id, ext, src) };
  }

  /**
   * What Calibre keeps beside a book: its details, as metadata.opf, and its
   * cover. Only those two files are read, and only next to a book file.
   */
  async sidecar(src: string): Promise<{ opf?: string; cover?: Uint8Array }> {
    if (!READABLE.includes(extname(src).slice(1).toLowerCase())) return {};
    const dir = dirname(src);
    const opf = await readFile(join(dir, "metadata.opf"), "utf8").catch(() => undefined);
    if (!opf) return {};
    const cover = await readFile(join(dir, "cover.jpg")).catch(() => undefined);
    return { opf, cover: cover && new Uint8Array(cover) };
  }

  async removeFormat(id: string, ext: string) {
    const book = this.get(id);
    if (book.formats.length < 2) throw new Error(t("A book keeps at least one file."));
    const format = book.formats.find((f) => f.ext === ext);
    if (!format) return book;
    const path = join(this.bookDir(book), format.file);
    await toTrash(path).catch(() => rm(path, { force: true, maxRetries: 5 }));
    book.formats = book.formats.filter((f) => f.ext !== ext);
    this.save();
    return book;
  }

  /** Moves the files of `from` into `into`, then drops `from`. */
  async merge(from: string, into: string) {
    const source = this.get(from);
    const target = this.get(into);
    for (const format of source.formats) {
      if (target.formats.some((f) => f.ext === format.ext)) continue;
      await this.addFormat(into, format.ext, join(this.bookDir(source), format.file));
    }
    // Only once every file is safely copied does the old folder go, and to the Trash.
    const dir = this.ownFolder(source);
    this.report(`Joining ${source.dir} into ${target.dir}`);
    await trashOrLeave(dir, this.report);
    await this.tidy(dirname(dir));
    this.books.delete(from);
    this.save();
    return target;
  }

  /** Hides books at once and sends their folders to the system Trash after the undo window. */
  remove(ids: string[], undoFor = 12_000) {
    for (const id of ids) {
      if (!this.books.has(id)) continue;
      this.pending.set(id, setTimeout(() => this.purge(id).catch((error) => console.error("Could not remove a book", error)), undoFor));
    }
    this.save();
  }

  restore(ids: string[]) {
    for (const id of ids) {
      clearTimeout(this.pending.get(id));
      this.pending.delete(id);
    }
    this.save();
    return ids.map((id) => this.books.get(id)).filter(Boolean) as Book[];
  }

  private async purge(id: string) {
    const book = this.books.get(id);
    this.pending.delete(id);
    if (!book) return;
    let dir: string;
    try {
      dir = this.ownFolder(book);
    } catch (error) {
      // The book leaves the library; its folder, shared or strange, stays where it is.
      this.report("Kept the folder of a removed book", error);
      this.books.delete(id);
      this.save();
      return;
    }
    this.books.delete(id);
    this.save();
    await trashOrLeave(dir, this.report);
    await this.tidy(dirname(dir));
  }

  /** Settles everything waiting, for when the app quits. */
  async settle() {
    // Saved first, so a slow Trash can never cost the library file.
    this.flushNow();
    for (const [id, timer] of this.pending) {
      clearTimeout(timer);
      await this.purge(id);
    }
    await this.flush();
  }

  /** Adds reading time to a book. */
  logReading(id: string, seconds: number) {
    const book = this.books.get(id);
    if (!book || seconds <= 0 || seconds > 3600) return;
    book.readSeconds = (book.readSeconds ?? 0) + seconds;
    this.save();
  }

  saveCollections(collections: Collection[]) {
    this.collections = collections;
    const ids = new Set(collections.map((c) => c.id));
    for (const book of this.books.values())
      if (book.collections.some((c) => !ids.has(c))) book.collections = book.collections.filter((c) => ids.has(c));
    this.save();
    return this.collections;
  }
}
