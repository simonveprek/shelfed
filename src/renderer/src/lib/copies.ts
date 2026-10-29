import { plainWords } from "../../../shared/series";
import type { Book, ReadStatus } from "../../../shared/types";

/*
 * The same book, twice: an EPUB here and a MOBI there, each a book of its own.
 * Calibre libraries are full of these, wherever someone added a book's formats
 * to Calibre one at a time. Two books are taken to be one when their titles
 * and authors match and they share no format: two volumes of collected poems
 * may share a title and an author, but two copies of one book wouldn't both
 * be EPUBs.
 */

/** Title, authors and place in a series: books 3 and 7 of a series are never copies of each other. */
const key = (book: Book) => `${plainWords(book.title)}\n${book.authors.map(plainWords).sort().join(";")}\n${book.seriesIndex ?? ""}`;

/** Whether two books are one book in different files. */
export function sameBook(a: Book, b: Book) {
  if (a.id === b.id || !plainWords(a.title) || key(a) !== key(b)) return false;
  return !a.formats.some((f) => b.formats.some((g) => g.ext === f.ext));
}

/** How much a book already knows, to keep the copy that knows most. */
const known = (book: Book) =>
  (book.series ? 4 : 0) + (book.description ? 2 : 0) + (book.isbn ? 2 : 0) + (book.progress ? 3 : 0) + (book.annotations?.length ? 3 : 0) + book.formats.length;

/**
 * The copies in a library, each as the book to keep and the copies to fold
 * into it. Only copies that bring formats the kept book lacks are joined.
 * With `among`, only groups holding one of those books count.
 */
export function findCopies(books: Book[], among?: Set<string>): Array<{ keep: Book; copies: Book[] }> {
  const groups = new Map<string, Book[]>();
  for (const book of books) {
    if (!plainWords(book.title)) continue;
    groups.set(key(book), [...(groups.get(key(book)) ?? []), book]);
  }
  const out: Array<{ keep: Book; copies: Book[] }> = [];
  for (const group of groups.values()) {
    if (group.length < 2 || (among && !group.some((b) => among.has(b.id)))) continue;
    const [keep, ...rest] = [...group].sort((a, b) => known(b) - known(a) || a.added - b.added);
    const formats = new Set(keep.formats.map((f) => f.ext));
    const copies: Book[] = [];
    for (const book of rest) {
      if (book.formats.some((f) => formats.has(f.ext))) continue;
      for (const f of book.formats) formats.add(f.ext);
      copies.push(book);
    }
    if (copies.length) out.push({ keep, copies });
  }
  return out;
}

const FURTHEST: ReadStatus[] = ["unread", "reading", "finished"];

/**
 * What the kept book takes from its copies: details it lacks, and everything
 * done with the copies in Shelfed, like reading progress, notes and ratings.
 */
export function inherit(keep: Book, copies: Book[]): Partial<Book> {
  const all = [keep, ...copies];
  const patch: Partial<Book> = {};
  for (const field of ["series", "seriesIndex", "description", "publisher", "published", "language", "isbn"] as const) {
    if (keep[field] === undefined || keep[field] === "") {
      const from = copies.find((c) => c[field] !== undefined && c[field] !== "");
      if (from) Object.assign(patch, { [field]: from[field] });
    }
  }
  const union = (pick: (b: Book) => string[]) => [...new Set(all.flatMap(pick))];
  const tags = union((b) => b.tags);
  if (tags.length !== keep.tags.length) patch.tags = tags;
  const collections = union((b) => b.collections);
  if (collections.length !== keep.collections.length) patch.collections = collections;
  const rating = Math.max(...all.map((b) => b.rating));
  if (rating !== keep.rating) patch.rating = rating;
  if (!keep.favorite && copies.some((c) => c.favorite)) patch.favorite = true;
  const status = all.map((b) => b.status).sort((a, b) => FURTHEST.indexOf(b) - FURTHEST.indexOf(a))[0];
  if (status !== keep.status) patch.status = status;
  // Where reading got furthest, in the file it was read in.
  const furthest = all.reduce((best, b) => ((b.progress ?? 0) > (best.progress ?? 0) ? b : best));
  if (furthest !== keep) {
    patch.progress = furthest.progress;
    patch.location = furthest.location;
    patch.readFormat = furthest.readFormat ?? furthest.formats[0]?.ext;
  }
  const notes = copies.flatMap((c) => c.annotations ?? []);
  if (notes.length) patch.annotations = [...(keep.annotations ?? []), ...notes];
  const seconds = copies.reduce((n, c) => n + (c.readSeconds ?? 0), 0);
  if (seconds) patch.readSeconds = (keep.readSeconds ?? 0) + seconds;
  const opened = Math.max(...all.map((b) => b.opened ?? 0));
  if (opened && opened !== keep.opened) patch.opened = opened;
  const finishedAt = all.find((b) => b.finishedAt && b.status === "finished")?.finishedAt;
  if (finishedAt && !keep.finishedAt) patch.finishedAt = finishedAt;
  return patch;
}
