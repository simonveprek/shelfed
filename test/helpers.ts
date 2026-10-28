import type { Book } from "../src/shared/types";

let n = 0;

/** A book with sensible defaults, for tests. */
export function book(patch: Partial<Book> = {}): Book {
  n++;
  return {
    id: `b${n}`,
    title: `Book ${n}`,
    authors: [],
    tags: [],
    collections: [],
    rating: 0,
    status: "unread",
    favorite: false,
    formats: [{ ext: "epub", file: "book.epub", size: 1000 }],
    dir: `Author/Book ${n}`,
    cover: 0,
    added: 0,
    modified: 0,
    ...patch,
  };
}
