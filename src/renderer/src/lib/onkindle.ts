import type { Book, KindleFile } from "../../../shared/types";
import { norm } from "./util";

/** A file's name as words, without its extension or the tags Amazon and Calibre add. */
const words = (file: string) =>
  norm(
    file
      .replace(/\.[^.]+$/, "")
      .replace(/_(EBOK|PDOC|EBSP)$/i, "")
      .replace(/_(?=[0-9A-Z]*\d)[0-9A-Z]{10}$/i, ""),
  );

/** Whether a file on a Kindle, by its name as words, is this book. */
function isTheBook(book: Book, name: string) {
  const title = norm(book.title);
  if (!title || !name) return false;
  if (book.formats.some((f) => words(f.file) === name) || name === title) return true;
  if (book.kindleNames?.some((file) => words(file) === name)) return true;
  // After the title, only a writer of it may follow: "Dune Frank Herbert" is
  // Dune, "Dune Messiah Frank Herbert" isn't.
  if (!name.startsWith(`${title} `)) return false;
  const rest = name.slice(title.length + 1);
  return book.authors.some((author) => {
    const whole = norm(author);
    const surname = whole.split(" ").at(-1) ?? "";
    return rest === whole || rest === surname || rest.startsWith(`${whole} `);
  });
}

/**
 * Which books are already on a Kindle, from the names of the files on it.
 * Shelfed names what it copies "Title - Author", as Calibre does, and books
 * sent by email keep their title, so a file counts when its name is the
 * title, alone or followed by one of the book's writers. "Dune" never claims
 * "Dune Messiah", nor "It" every file that starts with it.
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

/** What a Kindle keeps in its documents folder that isn't someone's book: its dictionaries and its own guide. */
const KINDLES_OWN = /^dictionaries\/|(^|\/)kindle_.*guide[^/]*$/i;

/**
 * The books on a Kindle that aren't in the library yet, to bring over: the
 * ones Shelfed can read, and how many more are locked to the Kindle.
 */
export function notInLibrary(books: Book[], files: KindleFile[]) {
  const theirs = files.filter((file) => !KINDLES_OWN.test(file.path)).filter((file) => {
    const name = words(file.name);
    return name && !books.some((book) => isTheBook(book, name));
  });
  return { files: theirs.filter((f) => !f.locked), locked: theirs.filter((f) => f.locked).length };
}
