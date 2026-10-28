import { shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, sep } from "node:path";
import type { Book, Collection } from "../shared/types";
import { READABLE } from "../shared/types";

type Data = { version: 1; books: Book[]; collections: Collection[] };

const DB = "library.json";
/** A copy of the library file from the last good start, at most a day old. */
const BACKUP = "library.backup.json";

export const newId = (n = 10) => randomBytes(n).toString("base64url").replace(/[-_]/g, "x").slice(0, n);

/** Keeps names safe on every file system Windows and macOS have. */
export function safeName(name: string, max = 80) {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim();
  return (clean || "Unknown").slice(0, max).trim();
}

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
 * Runs a step that needs a folder to exist, again if a tidy elsewhere took
 * that folder away at the same moment. Imports run side by side, and one
 * book leaving a folder can empty it just as another arrives.
 */
async function withFolder<T>(step: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await step();
    } catch (error) {
      // macOS reports a folder that vanished halfway through mkdir as ENOTDIR.
      const code = (error as NodeJS.ErrnoException).code;
      if ((code !== "ENOENT" && code !== "ENOTDIR") || attempt >= 5) throw error;
    }
  }
}

const baseName = (book: Book) => safeName(`${book.title}${book.authors[0] ? ` - ${book.authors[0]}` : ""}`, 110);

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
  private saving = Promise.resolve();

  constructor(root: string) {
    this.root = root;
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
    if (!book) throw new Error("That book is no longer in the library.");
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
    const data: Data = { version: 1, books: this.list(), collections: this.collections };
    const json = JSON.stringify(data);
    const path = join(this.root, DB);
    this.saving = this.saving
      .then(async () => {
        await writeFile(path + ".tmp", json);
        await rename(path + ".tmp", path);
      })
      .catch((error) => {
        // The library in memory stays whole and the next change tries again.
        console.error("Could not save the library", error);
        this.onSaveError?.(error);
      });
    return this.saving;
  }

  bookDir(book: Book) {
    return join(this.root, book.dir);
  }

  filePath(book: Book, ext?: string) {
    const format = ext ? book.formats.find((f) => f.ext === ext) : book.formats[0];
    if (!format) throw new Error(`This book has no ${ext?.toUpperCase()} file.`);
    return join(this.bookDir(book), format.file);
  }

  /** Every readable file under the given paths, folders searched through. */
  async collect(paths: string[]): Promise<string[]> {
    const out: string[] = [];
    const walk = async (path: string, depth: number) => {
      const info = await stat(path).catch(() => null);
      if (!info) return;
      if (info.isDirectory()) {
        if (depth > 8 || basename(path).startsWith(".")) return;
        for (const name of await readdir(path)) await walk(join(path, name), depth + 1);
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
    const raw = extname(src).slice(1).toLowerCase();
    const ext = raw === "htm" ? "html" : raw === "markdown" ? "md" : raw;
    const id = newId();
    const title = titleFromFile(src);
    const dir = join("Incoming", id);
    const file = `${safeName(title)}.${ext}`;
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
    const author = safeName(book.authors[0] || "Unknown Author", 60);
    const wanted = join(author, `${safeName(book.title || "Untitled", 70)} (${book.id.slice(0, 4)})`);
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
        await rename(join(dir, format.file), join(dir, name)).catch(() => {});
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
    if (dir === this.root || !dir.startsWith(this.root + sep)) return;
    await rm(join(dir, ".DS_Store"), { force: true }).catch(() => {});
    await rmdir(dir).catch(() => {});
  }

  async update(id: string, patch: Partial<Book>, relocate = false) {
    const book = this.get(id);
    const { id: _id, dir: _dir, formats: _formats, ...rest } = patch;
    // The day a book is finished is kept, for the year's count.
    if (rest.status === "finished" && book.status !== "finished") rest.finishedAt ??= Date.now();
    if (rest.status && rest.status !== "finished") rest.finishedAt = undefined;
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
    if (book.formats.some((f) => f.ext === ext)) throw new Error(`This book already has an ${ext.toUpperCase()}. Remove it first to make a new one.`);
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

  async removeFormat(id: string, ext: string) {
    const book = this.get(id);
    if (book.formats.length < 2) throw new Error("A book keeps at least one file.");
    const format = book.formats.find((f) => f.ext === ext);
    if (!format) return book;
    const path = join(this.bookDir(book), format.file);
    await shell.trashItem(path).catch(() => rm(path, { force: true }));
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
    await shell.trashItem(this.bookDir(source)).catch(() => rm(this.bookDir(source), { recursive: true, force: true }));
    await this.tidy(dirname(this.bookDir(source)));
    this.books.delete(from);
    this.save();
    return target;
  }

  /** Hides books at once and sends their folders to the system Trash after the undo window. */
  remove(ids: string[], undoFor = 12_000) {
    for (const id of ids) {
      if (!this.books.has(id)) continue;
      this.pending.set(id, setTimeout(() => this.purge(id), undoFor));
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
    this.books.delete(id);
    const dir = this.bookDir(book);
    await shell.trashItem(dir).catch(() => rm(dir, { recursive: true, force: true }));
    await this.tidy(dirname(dir));
    this.save();
  }

  /** Settles everything waiting, for when the app quits. */
  async settle() {
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
