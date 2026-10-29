import type { Book } from "../../../shared/types";
import { norm } from "./util";

/** A file's name as words, without its extension or the tags Amazon and Calibre add. */
const words = (file: string) =>
  norm(
    file
      .replace(/\.[^.]+$/, "")
      .replace(/_(EBOK|PDOC|EBSP)$/i, "")
      .replace(/_B0[0-9A-Z]{8}$/i, ""),
  );

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
  for (const book of books) {
    const title = norm(book.title);
    if (!title) continue;
    const full = norm(`${book.title} ${book.authors[0] ?? ""}`);
    const own = book.formats.map((f) => words(f.file));
    const match = names.some((name) => own.includes(name) || name === full || name === title || (title.length >= 4 && name.startsWith(`${title} `)));
    if (match) on.add(book.id);
  }
  return on;
}
