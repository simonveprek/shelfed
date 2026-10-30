import type { Book, Collection } from "../../../shared/types";
import { KINDLE_EMAIL, KINDLE_LIMIT, KINDLE_USB } from "../../../shared/types";
import { toast } from "@/components/ui";
import { api, isMac } from "./api";
import { relistKindle } from "./kindle";
import { notInLibrary } from "./onkindle";
import { extractContent, parseBook, saveCover } from "./books";
import { readCalibreOpf } from "./calibre";
import { findCopies, inherit } from "../../../shared/copies";
import { seriesFix } from "../../../shared/series";
import { buildDocx } from "./docx";
import { buildEpub, buildHtml, buildText } from "./epub";
import { buildFb2 } from "./fb2";
import {
  bookById, drop, failed, flashMood, patchBooks, saveCollections, startJob, upsert, useStore, type JobHandle,
} from "./store";
import { bytes, FOLIATE, readingFormat, TEXTUAL } from "./util";
import { t, tn } from "../../../shared/i18n";

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
  // A series written into the title becomes the book's series, and the title its own again.
  const series = seriesFix({ title: patch.title ?? book.title, series: patch.series, seriesIndex: patch.seriesIndex });
  if (series) patch = { ...patch, ...series };
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
/** What an import did, for whoever asked for it. */
export type Imported = { added: number; skipped: number; joined: number; ids: string[]; books: Record<string, string> };

export async function importPaths(paths: string[], open = false, from?: string): Promise<Imported | null> {
  if (!paths.length) return null;
  const books = await api.collect(paths);
  if (!books.length) {
    // Nothing worth saying about a download that turned out not to be a book.
    if (!from) toast.error(t("No books there that Shelfed can read"));
    return null;
  }
  const job = startJob(tn(books.length, "Adding a book", "Adding {n} books"));
  set({ mood: "reading" });
  let added = 0;
  let skipped = 0;
  let joined = 0;
  let done = 0;
  const touched = new Set<string>();
  const fresh = new Set<string>();
  // Which book each file went into.
  const filed = new Map<string, string>();
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
          // Calibre's details put right what was read from the file, but not what someone set by hand here.
          const { title, authors, series, seriesIndex } = book.edited ? {} : (calibre ?? {});
          const fix = Object.fromEntries(Object.entries({ title, authors, series, seriesIndex }).filter(([, v]) => v !== undefined));
          current = Object.keys(fix).length ? await api.update(book.id, fix, true) : book;
        } else {
          upsert(book);
          current = await finishImport(book, calibre, cover);
          fresh.add(current.id);
          added++;
        }
        for (const path of others) {
          const { book: grown, folded } = await api.joinFile(current.id, path).catch((error) => {
            // The book is in without this format; the log says which file and why.
            console.error(`Couldn't add ${path} to ${current.title}:`, error instanceof Error ? error.message : error);
            return { book: current, folded: undefined };
          });
          if (folded) {
            drop([folded]);
            touched.delete(folded);
            for (const [file, id] of filed) if (id === folded) filed.set(file, current.id);
            joined++;
          }
          current = grown;
        }
        upsert(current);
        touched.add(current.id);
        for (const path of [first, ...others]) filed.set(path, current.id);
        last = current;
      } catch {
        // One bad file does not stop the rest.
      }
      done++;
      job.update({ progress: done / books.length, detail: t("{done} of {total}", { done, total: books.length }) });
    });
    // Copies that came as books of their own, like an EPUB and a MOBI Calibre kept apart, join up.
    const into = await joinCopies(touched);
    joined += into.size;
    // A new book that turned out to be a copy is a format now, not a book of its own.
    added -= [...into.keys()].filter((id) => fresh.has(id)).length;
    if (last && into.has((last as Book).id)) last = bookById(into.get((last as Book).id)!) ?? null;
    set({ mood: null });
    const notes = [
      skipped && tn(skipped, "{n} already here", "{n} already here"),
      joined && tn(joined, "{n} copy joined to its book", "{n} copies joined to their books"),
    ].filter(Boolean).join(", ");
    // App.tsx says where downloads came from in English ("your Downloads"); the whole sentence is translated here.
    const sentence = from
      ? tn(added, "Added {n} book from {place}", "Added {n} books from {place}", { place: t(from) })
      : tn(added, "Added {n} book", "Added {n} books");
    job.done(added ? `${sentence}${notes ? `, ${notes}` : ""}` : joined ? tn(joined, "Joined {n} copy to its book", "Joined {n} copies to their books") : t("Those books are already here"));
    const book = last as Book | null;
    // A single file handed over opens; a folder, even of one book, doesn't.
    if (book && open && paths.length === 1 && books.length === 1 && books[0][0] === paths[0]) openReader(book.id);
    else if (book) set({ selection: [book.id], anchor: book.id });
    const final = (id: string) => into.get(id) ?? id;
    return {
      added,
      skipped,
      joined,
      ids: [...touched].map(final).filter((id, i, all) => all.indexOf(id) === i),
      books: Object.fromEntries([...filed].map(([path, id]) => [path, final(id)])),
    };
  } catch (error) {
    set({ mood: null });
    job.fail(error);
    return null;
  }
}

/**
 * Folds copies of a book into it: their files become its formats, and it takes
 * whatever it lacked from them, reading progress and notes included. The
 * copies' folders go to the Trash or Recycle Bin.
 */
export async function joinBooks(keepId: string, copyIds: string[]) {
  const keep = bookById(keepId);
  const copies = copyIds.map(bookById).filter((b): b is Book => Boolean(b) && b!.id !== keepId);
  if (!keep || !copies.length) return keep ?? null;
  let joined = await api.update(keep.id, inherit(keep, copies));
  for (const copy of copies) {
    joined = await api.merge(copy.id, keep.id);
    drop([copy.id]);
  }
  upsert(joined);
  return joined;
}

/** Joins every copy in the library, or only those of the given books. Says which book each copy went into. */
export async function joinCopies(among?: Set<string>) {
  const into = new Map<string, string>();
  for (const { keep, copies } of findCopies(get().books, among)) {
    const joined = await joinBooks(keep.id, copies.map((c) => c.id)).catch((error) => {
      // In the log, for when someone tells us joining went wrong.
      console.error(`Couldn't join copies of ${keep.title}:`, error instanceof Error ? error.message : error);
      return null;
    });
    if (!joined) continue;
    for (const copy of copies) into.set(copy.id, keep.id);
  }
  return into;
}

/** The books picked by hand, joined into the one that knows most about itself. */
export async function joinSelected(ids: string[]) {
  const books = ids.map(bookById).filter((b): b is Book => Boolean(b));
  if (books.length < 2) return;
  const [keep, ...rest] = [...books].sort((a, b) => b.formats.length - a.formats.length || a.added - b.added);
  const joined = await joinBooks(keep.id, rest.map((b) => b.id));
  if (joined) {
    set({ selection: [joined.id], anchor: joined.id });
    toast.success(rest.length > 1 ? tn(books.length, "Joined into one book from {n}", "Joined into one book from {n}") : t("Joined into one book"), {
      description: isMac ? t("Files it already had went to the Trash, with the copies' folders.") : t("Files it already had went to the Recycle Bin, with the copies' folders."),
    });
  }
}

/**
 * Brings a Calibre library over: every book, with its formats, cover and the
 * details set in Calibre, copies joined and series found, then says what came
 * of it. Calibre's own library is only read, never changed.
 */
export async function bringCalibreOver(path: string, books: number) {
  set({ dialog: { kind: "calibre", path, books, working: true } });
  const result = await importPaths([path]);
  const brought = (result?.ids ?? []).map(bookById).filter((b): b is Book => Boolean(b));
  set({
    dialog: {
      kind: "calibre",
      path,
      books,
      done: {
        // Books as they now are in the library, copies joined.
        added: brought.length,
        skipped: result?.skipped ?? 0,
        joined: result?.joined ?? 0,
        series: new Set(brought.map((b) => b.series).filter(Boolean)).size,
        authors: new Set(brought.flatMap((b) => b.authors)).size,
      },
    },
  });
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

/** Every format Shelfed can make, and whether it can make it from this book. Labels are translated here, when asked for, not when the file loads. */
export function targetsFor(book: Book): Target[] {
  return TARGETS.map((ext) => {
    const from = sourceFor(book, ext);
    return { ext, label: t(LABELS[ext][0]), note: t(LABELS[ext][1]), possible: Boolean(from && canRead(from)) };
  });
}

/** Makes a new format of a book and adds it beside the others. */
export async function convert(id: string, to: string, outer?: JobHandle): Promise<Book> {
  let book = bookById(id)!;
  const from = sourceFor(book, to);
  if (!targetsFor(book).find((t) => t.ext === to)?.possible) throw new Error(t("Shelfed can't read this book's files to make {format} from them.", { format: to.toUpperCase() }));
  const job = outer ?? startJob(t("{title} to {format}", { title: book.title, format: to.toUpperCase() }));
  set({ mood: "thinking" });
  try {
    let saved: Book;
    if (to === "azw3") {
      // A Kindle file is made from the EPUB, so that comes first.
      if (!book.formats.some((f) => f.ext === "epub")) book = await convert(id, "epub", job);
      job.update({ detail: t("Making the Kindle file"), progress: 0.9 });
      saved = await api.makeAzw3(id);
    } else {
      job.update({ detail: t("Reading the {format}", { format: from.toUpperCase() }) });
      const content = await extractContent(book, from, (share) => job.update({ progress: share * 0.8 }));
      if (!content.chapters.length) throw new Error(t("There were no words to take out of this file."));
      job.update({ detail: t("Making the {format}", { format: to.toUpperCase() }), progress: 0.85 });
      await new Promise((r) => setTimeout(r));
      if (to === "epub") saved = await api.addFormat(id, "epub", buildEpub(content));
      else if (to === "pdf") saved = await api.pdfFormat(id, buildHtml(content, true));
      else if (to === "txt") saved = await api.addFormat(id, "txt", new TextEncoder().encode(buildText(content)));
      else if (to === "docx") saved = await api.addFormat(id, "docx", buildDocx(content));
      else if (to === "fb2") saved = await api.addFormat(id, "fb2", buildFb2(content));
      else saved = await api.addFormat(id, "html", new TextEncoder().encode(buildHtml(content)));
    }
    upsert(saved);
    if (!outer) job.done(t("{title} is now {format} too", { title: book.title, format: to.toUpperCase() }));
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
  const job = startJob(tn(ids.length, "Converting {n} book to {format}", "Converting {n} books to {format}", { format: to.toUpperCase() }));
  let failures = 0;
  for (let i = 0; i < ids.length; i++) {
    const book = bookById(ids[i]);
    job.update({ progress: i / ids.length, detail: book?.title });
    if (!book || book.formats.some((f) => f.ext === to)) continue;
    // A quiet handle keeps each book's own progress out of the batch's bar.
    const inner = { ...job, update: (p: { detail?: string }) => p.detail && job.update({ detail: `${book.title}, ${p.detail.toLowerCase()}` }) } as JobHandle;
    await convert(ids[i], to, inner).catch(() => failures++);
  }
  if (failures) job.fail(t("{n} of {total} could not be converted", { n: String(failures), total: String(ids.length) }));
  else job.done(tn(ids.length, "Converted {n} book to {format}", "Converted {n} books to {format}", { format: to.toUpperCase() }));
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
  const job = startJob(books.length === 1 ? t("Sending {title}", { title: books[0].title }) : tn(books.length, "Sending {n} book", "Sending {n} books"));
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
      if (size > KINDLE_LIMIT) throw new Error(t("{size} is over the 50 MB Amazon takes by email", { size: bytes(size) }));
      job.update({ detail: t("Mailing the {format}, {size}", { format: plan.ext.toUpperCase(), size: bytes(size) }) });
      await api.sendMail(book.id, plan.ext);
    } catch (error) {
      failures++;
      lastError = error;
    }
  }
  set({ mood: null });
  kindle.end(failures === 0);
  if (failures === books.length) job.fail(lastError);
  else if (failures) job.fail(t("{n} of {total} did not send", { n: String(failures), total: String(books.length) }));
  else job.done(books.length === 1 ? t("Sent. It reaches your Kindle in a few minutes") : tn(books.length, "Sent {n} book to your Kindle", "Sent {n} books to your Kindle"));
  return failures === 0;
}

export async function sendByCable(ids: string[], device: string) {
  const books = ids.map(bookById).filter(Boolean) as Book[];
  const job = startJob(books.length === 1 ? t("Copying {title}", { title: books[0].title }) : tn(books.length, "Copying {n} book", "Copying {n} books"));
  const kindle = kindleBusy("cable", books[0]?.id ?? "");
  let failures = 0;
  let lastError: unknown;
  for (let i = 0; i < books.length; i++) {
    let book = books[i];
    job.update({ progress: i / books.length, detail: book.title });
    kindle.progress(i / books.length);
    try {
      const plan = usbPlan(book);
      if (!plan) throw new Error(t("Shelfed can't read this book's files to make a Kindle file from them"));
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
  else if (failures) job.fail(t("{n} of {total} were not copied", { n: String(failures), total: String(books.length) }));
  else job.done(books.length === 1 ? t("On your Kindle") : tn(books.length, "Copied {n} book to your Kindle", "Copied {n} books to your Kindle"));
}

/**
 * Brings over the books on the Kindle plugged in that aren't in the library
 * yet. They're copied, so they stay on the Kindle too, and each remembers its
 * name there so it counts as on it. Books bought from Amazon are locked to
 * Kindles and stay where they are.
 */
export async function bringFromKindle() {
  const drive = get().kindlePort?.drives[0];
  const files = get().kindleFiles;
  if (!drive || !files) return;
  const { files: theirs, locked } = notInLibrary(get().books, files);
  const root = drive.path.replace(/[\\/]+$/, "");
  const paths = theirs.map((file) => `${root}/documents/${file.path}`);
  const result = paths.length ? await importPaths(paths, false, "your Kindle") : null;
  const names = new Map<string, string[]>();
  theirs.forEach((file, i) => {
    const id = result?.books[paths[i]];
    if (id) names.set(id, [...(names.get(id) ?? []), file.name]);
  });
  if (names.size) await patchBooks([...names.keys()], (b) => ({ kindleNames: [...new Set([...(b.kindleNames ?? []), ...names.get(b.id)!])] }));
  if (locked) {
    toast(tn(locked, "{n} book bought from Amazon stays on your Kindle", "{n} books bought from Amazon stay on your Kindle"), {
      description: t("Amazon locks the books it sells to Kindles and its apps, so no other app can open them."),
    });
  }
}

/* ------------------------------------------------------------------------ */
/* Removing, with an undo                                                    */
/* ------------------------------------------------------------------------ */

export async function removeBooks(ids: string[]) {
  const first = bookById(ids[0])?.title ?? t("Book");
  await api.remove(ids);
  drop(ids);
  set((s) => ({ reading: s.reading && ids.includes(s.reading.id) ? null : s.reading }));
  toast(ids.length === 1 ? t("Removed {title}", { title: first }) : tn(ids.length, "Removed {n} book", "Removed {n} books"), {
    description: t("The files go to the Trash in a few seconds"),
    duration: 10_000,
    action: {
      label: t("Undo"),
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
  const collection: Collection = { id: Math.random().toString(36).slice(2, 10), name: name.trim() || t("New collection"), created: Date.now() };
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
  toast.success(ids.length === 1 ? t("Added to {name}", { name: String(name) }) : tn(ids.length, "Added {n} book to {name}", "Added {n} books to {name}", { name: String(name) }));
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
