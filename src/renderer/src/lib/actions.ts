import type { Book, Collection } from "../../../shared/types";
import { KINDLE_EMAIL, KINDLE_LIMIT, KINDLE_USB } from "../../../shared/types";
import { toast } from "@/components/ui";
import { api } from "./api";
import { relistKindle } from "./kindle";
import { extractContent, parseBook, saveCover } from "./books";
import { readCalibreOpf } from "./calibre";
import { buildDocx } from "./docx";
import { buildEpub, buildHtml, buildText } from "./epub";
import { buildFb2 } from "./fb2";
import {
  bookById, drop, failed, flashMood, patchBooks, saveCollections, startJob, upsert, useStore, type JobHandle,
} from "./store";
import { bytes, FOLIATE, plural, readingFormat, TEXTUAL } from "./util";

const get = useStore.getState;
const set = useStore.setState;

/* ------------------------------------------------------------------------ */
/* Adding books                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Reads a freshly copied book's details and cover, then files it away. Details
 * Calibre kept for it count for more than the file's own, and so does its cover.
 */
async function finishImport(book: Book, calibre?: Partial<Book>, calibreCover?: Blob): Promise<Book> {
  let patch: Partial<Book> = {};
  let cover: Blob | null = null;
  try {
    ({ patch, cover } = await parseBook(book));
  } catch {
    // An unreadable file still joins the library, named after its file.
  }
  patch = { ...patch, ...calibre };
  cover = calibreCover ?? cover;
  // The same book in another format joins the one already here, but only when
  // the ISBN proves it. Two books can share a title and an author and still be
  // different books, like two volumes of collected poems.
  const isbn = (patch.isbn ?? "").replace(/[^0-9X]/gi, "");
  const twin = isbn.length >= 10
    ? get().books.find((b) => b.id !== book.id && b.parsed && (b.isbn ?? "").replace(/[^0-9X]/gi, "") === isbn && !b.formats.some((f) => f.ext === book.formats[0].ext))
    : undefined;
  if (twin) {
    const merged = await api.merge(book.id, twin.id);
    drop([book.id]);
    upsert(merged);
    return merged;
  }
  let saved = await api.update(book.id, { ...patch, parsed: true }, true);
  if (cover) saved = await saveCover(book.id, cover).catch(() => saved);
  upsert(saved);
  return saved;
}

/** Runs at most `limit` tasks at once. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await task(items[next++]);
    }),
  );
}

/**
 * Adds the books under these paths. Each book comes with all its formats: a
 * Calibre library's EPUB and MOBI of one book become one book with two files.
 * Brought in again, a Calibre library also joins up books that came in as
 * separate copies before, and its details put right what was read from files.
 */
export async function importPaths(paths: string[], open = false) {
  if (!paths.length) return;
  const books = await api.collect(paths);
  if (!books.length) {
    toast.error("No books there that Shelfed can read");
    return;
  }
  const job = startJob(books.length === 1 ? "Adding a book" : `Adding ${books.length.toLocaleString()} books`);
  set({ mood: "reading" });
  let added = 0;
  let skipped = 0;
  let joined = 0;
  let done = 0;
  let last: Book | null = null;
  try {
    await pool(books, 3, async ([first, ...others]) => {
      try {
        const side = await api.sidecar(first).catch(() => ({}) as { opf?: string; cover?: Uint8Array });
        const calibre = side.opf ? readCalibreOpf(side.opf) : undefined;
        const cover = side.cover ? new Blob([side.cover as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }) : undefined;
        const { book, duplicate } = await api.importFile(first);
        let current: Book;
        if (duplicate) {
          skipped++;
          const { title, authors, series, seriesIndex } = calibre ?? {};
          const fix = Object.fromEntries(Object.entries({ title, authors, series, seriesIndex }).filter(([, v]) => v !== undefined));
          current = Object.keys(fix).length ? await api.update(book.id, fix, true) : book;
        } else {
          upsert(book);
          current = await finishImport(book, calibre, cover);
          added++;
        }
        for (const path of others) {
          const { book: grown, folded } = await api.joinFile(current.id, path).catch(() => ({ book: current, folded: undefined }));
          if (folded) {
            drop([folded]);
            joined++;
          }
          current = grown;
        }
        upsert(current);
        last = current;
      } catch {
        // One bad file does not stop the rest.
      }
      done++;
      job.update({ progress: done / books.length, detail: `${done.toLocaleString()} of ${books.length.toLocaleString()}` });
    });
    set({ mood: null });
    const notes = [skipped && `${skipped} already here`, joined && `${plural(joined, "copy", "copies")} joined to ${joined === 1 ? "its book" : "their books"}`].filter(Boolean).join(", ");
    job.done(added ? `Added ${plural(added, "book")}${notes ? `, ${notes}` : ""}` : joined ? `Joined ${plural(joined, "copy", "copies")} to ${joined === 1 ? "its book" : "their books"}` : "Those books are already here");
    const book = last as Book | null;
    // A single file handed over opens; a folder, even of one book, doesn't.
    if (book && open && paths.length === 1 && books.length === 1 && books[0][0] === paths[0]) openReader(book.id);
    else if (book) set({ selection: [book.id], anchor: book.id });
  } catch (error) {
    set({ mood: null });
    job.fail(error);
  }
}

export async function pickAndImport(folder = false) {
  importPaths(folder ? await api.pickFolder() : await api.pickFiles());
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                   */
/* ------------------------------------------------------------------------ */

export function openReader(id: string, ext?: string) {
  const book = bookById(id);
  const format = ext ?? (book && readingFormat(book));
  if (!book || !format) return;
  set({ reading: { id, ext: format } });
  patchBooks([id], (b) => ({ opened: Date.now(), status: b.status === "unread" ? "reading" : b.status }));
}

/* ------------------------------------------------------------------------ */
/* Converting                                                                */
/* ------------------------------------------------------------------------ */

export type Target = { ext: string; label: string; note: string; possible: boolean };

const TARGETS = ["epub", "azw3", "pdf", "docx", "txt", "html", "fb2"];
const SOURCE_ORDER = ["epub", "azw3", "mobi", "azw", "kf8", "fb2", "fbz", "docx", "html", "md", "txt", "cbz", "pdf", "prc"];
const LABELS: Record<string, [string, string]> = {
  epub: ["EPUB", "Reads everywhere. Best for Kindle by email"],
  pdf: ["PDF", "Fixed pages, laid out for print"],
  azw3: ["AZW3", "Kindle's own format, for copying by cable"],
  txt: ["Plain text", "Only the words"],
  html: ["Web page", "One file any browser opens"],
  docx: ["Word", "To edit in Word or Pages"],
  fb2: ["FB2", "FictionBook, for readers that like it"],
};

export const canRead = (ext: string) => FOLIATE.includes(ext) || TEXTUAL.includes(ext) || ext === "pdf";

/** The file a conversion should start from. */
export function sourceFor(book: Book, to: string) {
  return SOURCE_ORDER.find((ext) => ext !== to && book.formats.some((f) => f.ext === ext)) ?? book.formats[0]?.ext;
}

/** Every format Shelfed can make, and whether it can make it from this book. */
export function targetsFor(book: Book): Target[] {
  return TARGETS.map((ext) => {
    const from = sourceFor(book, ext);
    return { ext, label: LABELS[ext][0], note: LABELS[ext][1], possible: Boolean(from && canRead(from)) };
  });
}

/** Makes a new format of a book and adds it beside the others. */
export async function convert(id: string, to: string, outer?: JobHandle): Promise<Book> {
  let book = bookById(id)!;
  const from = sourceFor(book, to);
  if (!targetsFor(book).find((t) => t.ext === to)?.possible) throw new Error(`Shelfed can't read this book's files to make ${to.toUpperCase()} from them.`);
  const job = outer ?? startJob(`${book.title} to ${to.toUpperCase()}`);
  set({ mood: "thinking" });
  try {
    let saved: Book;
    if (to === "azw3") {
      // A Kindle file is made from the EPUB, so that comes first.
      if (!book.formats.some((f) => f.ext === "epub")) book = await convert(id, "epub", job);
      job.update({ detail: "Making the Kindle file", progress: 0.9 });
      saved = await api.makeAzw3(id);
    } else {
      job.update({ detail: `Reading the ${from.toUpperCase()}` });
      const content = await extractContent(book, from, (share) => job.update({ progress: share * 0.8 }));
      if (!content.chapters.length) throw new Error("There were no words to take out of this file.");
      job.update({ detail: `Making the ${to.toUpperCase()}`, progress: 0.85 });
      await new Promise((r) => setTimeout(r));
      if (to === "epub") saved = await api.addFormat(id, "epub", buildEpub(content));
      else if (to === "pdf") saved = await api.pdfFormat(id, buildHtml(content, true));
      else if (to === "txt") saved = await api.addFormat(id, "txt", new TextEncoder().encode(buildText(content)));
      else if (to === "docx") saved = await api.addFormat(id, "docx", buildDocx(content));
      else if (to === "fb2") saved = await api.addFormat(id, "fb2", buildFb2(content));
      else saved = await api.addFormat(id, "html", new TextEncoder().encode(buildHtml(content)));
    }
    upsert(saved);
    if (!outer) job.done(`${book.title} is now ${to.toUpperCase()} too`);
    return saved;
  } catch (error) {
    if (!outer) job.fail(error);
    throw error;
  } finally {
    set({ mood: null });
  }
}

export async function convertMany(ids: string[], to: string) {
  if (ids.length === 1) return void convert(ids[0], to).catch(() => {});
  const job = startJob(`Converting ${ids.length} books to ${to.toUpperCase()}`);
  let failures = 0;
  for (let i = 0; i < ids.length; i++) {
    const book = bookById(ids[i]);
    job.update({ progress: i / ids.length, detail: book?.title });
    if (!book || book.formats.some((f) => f.ext === to)) continue;
    // A quiet handle keeps each book's own progress out of the batch's bar.
    const inner = { ...job, update: (p: { detail?: string }) => p.detail && job.update({ detail: `${book.title}, ${p.detail.toLowerCase()}` }) } as JobHandle;
    await convert(ids[i], to, inner).catch(() => failures++);
  }
  if (failures) job.fail(`${failures} of ${ids.length} could not be converted`);
  else job.done(`Converted ${plural(ids.length, "book")} to ${to.toUpperCase()}`);
}

/* ------------------------------------------------------------------------ */
/* Kindle                                                                    */
/* ------------------------------------------------------------------------ */

/** Which file goes to Kindle by email, and whether it has to be made first. */
export function emailPlan(book: Book): { ext: string; convert: boolean } {
  const pref = get().settings.kindle.format;
  const has = (ext: string) => book.formats.some((f) => f.ext === ext);
  if (pref === "pdf") return { ext: "pdf", convert: !has("pdf") };
  if (pref === "original") {
    const own = book.formats.find((f) => KINDLE_EMAIL.includes(f.ext));
    if (own) return { ext: own.ext, convert: false };
  }
  if (has("epub")) return { ext: "epub", convert: false };
  const own = book.formats.find((f) => KINDLE_EMAIL.includes(f.ext) && !["txt", "html", "pdf"].includes(f.ext));
  if (own) return { ext: own.ext, convert: false };
  // A PDF with nothing better stays a PDF. Everything else becomes an EPUB.
  if (has("pdf") && !book.formats.some((f) => FOLIATE.includes(f.ext))) return { ext: "pdf", convert: false };
  return { ext: "epub", convert: true };
}

/** Which file goes to Kindle by cable: its own Kindle file, or an AZW3 made for it. */
export function usbPlan(book: Book): { ext: string; convert: boolean } | null {
  const own = KINDLE_USB.map((ext) => book.formats.find((f) => f.ext === ext)).find(Boolean);
  if (own && own.ext !== "pdf") return { ext: own.ext, convert: false };
  // A PDF with nothing better goes as it is, since its pages wouldn't reflow anyway.
  if (own && !book.formats.some((f) => FOLIATE.includes(f.ext) || TEXTUAL.includes(f.ext))) return { ext: own.ext, convert: false };
  if (targetsFor(book).find((t) => t.ext === "azw3")?.possible) return { ext: "azw3", convert: true };
  if (own) return { ext: own.ext, convert: false };
  return null;
}

/** Tells the 3D Kindle what's happening, and lets it rest a moment after. */
function kindleBusy(via: "cable" | "email", bookId: string) {
  const mine = { via, bookId, state: "working" as const, progress: 0 };
  set({ kindleActivity: mine });
  return {
    progress: (progress: number) => set((s) => (s.kindleActivity?.bookId === bookId ? { kindleActivity: { ...s.kindleActivity, progress } } : {})),
    end: (ok: boolean) => {
      const ended = { ...mine, state: ok ? ("done" as const) : ("failed" as const), progress: 1 };
      set({ kindleActivity: ended });
      setTimeout(() => get().kindleActivity === ended && set({ kindleActivity: null }), 2600);
    },
  };
}

export async function sendByEmail(ids: string[]) {
  const books = ids.map(bookById).filter(Boolean) as Book[];
  const job = startJob(books.length === 1 ? `Sending ${books[0].title}` : `Sending ${books.length} books`);
  const kindle = kindleBusy("email", books[0]?.id ?? "");
  set({ mood: "excited" });
  let failures = 0;
  let lastError: unknown;
  for (let i = 0; i < books.length; i++) {
    let book = books[i];
    try {
      job.update({ progress: i / books.length, detail: book.title });
      kindle.progress(i / books.length);
      const plan = emailPlan(book);
      if (plan.convert) {
        const inner = { ...job, update: (p: { detail?: string }) => p.detail && job.update({ detail: p.detail }) } as JobHandle;
        book = await convert(book.id, plan.ext, inner);
      }
      const size = book.formats.find((f) => f.ext === plan.ext)?.size ?? 0;
      if (size > KINDLE_LIMIT) throw new Error(`${bytes(size)} is over the 50 MB Amazon takes by email`);
      job.update({ detail: `Mailing the ${plan.ext.toUpperCase()}, ${bytes(size)}` });
      await api.sendMail(book.id, plan.ext);
    } catch (error) {
      failures++;
      lastError = error;
    }
  }
  set({ mood: null });
  kindle.end(failures === 0);
  if (failures === books.length) job.fail(lastError);
  else if (failures) job.fail(`${failures} of ${books.length} did not send`);
  else job.done(books.length === 1 ? "Sent. It reaches your Kindle in a few minutes" : `Sent ${plural(books.length, "book")} to your Kindle`);
  return failures === 0;
}

export async function sendByCable(ids: string[], device: string) {
  const books = ids.map(bookById).filter(Boolean) as Book[];
  const job = startJob(books.length === 1 ? `Copying ${books[0].title}` : `Copying ${books.length} books`);
  const kindle = kindleBusy("cable", books[0]?.id ?? "");
  let failures = 0;
  let lastError: unknown;
  for (let i = 0; i < books.length; i++) {
    let book = books[i];
    job.update({ progress: i / books.length, detail: book.title });
    kindle.progress(i / books.length);
    try {
      const plan = usbPlan(book);
      if (!plan) throw new Error("Shelfed can't read this book's files to make a Kindle file from them");
      if (plan.convert) {
        const inner = { ...job, update: (p: { detail?: string }) => p.detail && job.update({ detail: p.detail }) } as JobHandle;
        book = await convert(book.id, plan.ext, inner);
      }
      await api.copyToDevice(book.id, plan.ext, device);
    } catch (error) {
      failures++;
      lastError = error;
    }
  }
  kindle.end(failures === 0);
  relistKindle();
  if (failures === books.length) job.fail(lastError);
  else if (failures) job.fail(`${failures} of ${books.length} were not copied`);
  else job.done(books.length === 1 ? "On your Kindle" : `Copied ${plural(books.length, "book")} to your Kindle`);
}

/* ------------------------------------------------------------------------ */
/* Removing, with an undo                                                    */
/* ------------------------------------------------------------------------ */

export async function removeBooks(ids: string[]) {
  const first = bookById(ids[0])?.title ?? "Book";
  await api.remove(ids);
  drop(ids);
  set((s) => ({ reading: s.reading && ids.includes(s.reading.id) ? null : s.reading }));
  toast(ids.length === 1 ? `Removed ${first}` : `Removed ${ids.length} books`, {
    description: "The files go to the Trash in a few seconds",
    duration: 10_000,
    action: {
      label: "Undo",
      onClick: async () => {
        const books = await api.restore(ids);
        books.forEach(upsert);
        set({ selection: ids });
        flashMood("happy");
      },
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Collections and marks                                                     */
/* ------------------------------------------------------------------------ */

export function createCollection(name: string, add: string[] = []): Collection {
  const collection: Collection = { id: Math.random().toString(36).slice(2, 10), name: name.trim() || "New collection", created: Date.now() };
  saveCollections([...get().collections, collection]);
  if (add.length) addToCollection(add, collection.id, true);
  return collection;
}

export function addToCollection(ids: string[], collection: string, quiet = false) {
  const all = ids.every((id) => bookById(id)?.collections.includes(collection));
  patchBooks(ids, (b) => ({
    collections: all ? b.collections.filter((c) => c !== collection) : [...new Set([...b.collections, collection])],
  }));
  if (all || quiet) return;
  const name = get().collections.find((c) => c.id === collection)?.name;
  toast.success(ids.length === 1 ? `Added to ${name}` : `Added ${ids.length} books to ${name}`);
  flashMood("love", 1400);
}

export function removeFromCollection(ids: string[], collection: string) {
  patchBooks(ids, (b) => ({ collections: b.collections.filter((c) => c !== collection) }));
}

export function deleteCollection(id: string) {
  saveCollections(get().collections.filter((c) => c.id !== id));
  set((s) => ({
    books: s.books.map((b) => (b.collections.includes(id) ? { ...b, collections: b.collections.filter((c) => c !== id) } : b)),
    section: s.section.kind === "collection" && s.section.id === id ? { kind: "all" } : s.section,
  }));
}

export function toggleFavorite(ids: string[]) {
  const all = ids.every((id) => bookById(id)?.favorite);
  patchBooks(ids, () => ({ favorite: !all }));
  if (!all) flashMood("love", 1400);
}

export { failed };
