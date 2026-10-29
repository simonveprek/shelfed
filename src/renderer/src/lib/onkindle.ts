import type { Book, KindleFile } from "../../../shared/types";
import { norm } from "./util";

/** A file's name as words, without its extension or the tags Amazon and Calibre add. */
const words = (file: string) =>
  norm(
    file
      .replace(/\.[^.]+$/, "")
      .replace(/_(EBOK|PDOC|EBSP)$/i, "")
      .replace(/_B0[0-9A-Z]{8}$/i, ""),
  );

/** Whether a file on a Kindle, by its name as words, is this book. */
function isTheBook(book: Book, name: string) {
  const title = norm(book.title);
  if (!title || !name) return false;
  const full = norm(`${book.title} ${book.authors[0] ?? ""}`);
  return book.formats.some((f) => words(f.file) === name) || name === full || name === title || (title.length >= 4 && name.startsWith(`${title} `));
}

/**
 * Which books are already on a Kindle, from the names of the files on it.
 * Shelfed names what it copies "Title - Author", as Calibre does, and books
 * sent by email keep their title first, so a file whose name begins with a
 * book's title counts. Titles shorter than four letters only count when the
 * whole name matches, so "It" doesn't claim every file.
 */
export function booksOnKindle(books: Book[], files: string[]): Set<string> {
  const names = files.map(words).filter(Boolean);
  const on = new Set<string>();
  for (const book of books) if (names.some((name) => isTheBook(book, name))) on.add(book.id);
  return on;
}

/** The books on a Kindle that are finished in Shelfed, with their files there and the room they take. */
export function finishedOnKindle(books: Book[], files: KindleFile[]) {
  const named = files.map((file) => ({ file, name: words(file.name) }));
  const finished: Book[] = [];
  const theirs: KindleFile[] = [];
  for (const book of books) {
    if (book.status !== "finished") continue;
    const mine = named.filter(({ name }) => isTheBook(book, name)).map(({ file }) => file);
    if (!mine.length) continue;
    finished.push(book);
    for (const file of mine) if (!theirs.includes(file)) theirs.push(file);
  }
  return { books: finished, files: theirs, bytes: theirs.reduce((n, f) => n + f.size, 0) };
}
