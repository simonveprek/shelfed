import type { Annotation, Book } from "../../../shared/types";
import { norm } from "./util";

/*
 * The commonplace book: every line marked in every book, in one place, the way
 * readers used to copy theirs into a notebook. Newest reading first.
 */

export type Entry = { book: Book; highlights: Annotation[] };

const marked = (book: Book) => (book.annotations ?? []).filter((a) => a.kind !== "bookmark" && (a.text || a.note));

/** Every book with something marked, the latest first, narrowed by what's searched for. */
export function gatherHighlights(books: Book[], query = ""): Entry[] {
  const words = norm(query).split(" ").filter(Boolean);
  const entries: Entry[] = [];
  for (const book of books) {
    const all = marked(book);
    if (!all.length) continue;
    const about = norm(`${book.title} ${book.authors.join(" ")}`);
    const highlights = all
      .filter((a) => {
        const text = `${about} ${norm(`${a.text ?? ""} ${a.note ?? ""}`)}`;
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => b.created - a.created);
    if (highlights.length) entries.push({ book, highlights });
  }
  return entries.sort((a, b) => b.highlights[0].created - a.highlights[0].created);
}

/** Everything gathered, as Markdown to take elsewhere. */
export function commonplaceMarkdown(entries: Entry[]) {
  const out: string[] = [];
  for (const { book, highlights } of entries) {
    out.push(`# ${book.title}`);
    if (book.authors.length) out.push(`*${book.authors.join(", ")}*`);
    out.push("");
    for (const a of highlights) {
      if (a.text) out.push(`> ${a.text.replace(/\s*\n+\s*/g, " ")}`, "");
      if (a.note) out.push(a.note, "");
    }
  }
  return `${out.join("\n").trim()}\n`;
}

/** The next book in a series that hasn't been finished, once this one is. */
export function nextInSeries(book: Book, books: Book[]) {
  if (!book.series) return null;
  const series = norm(book.series);
  const after = book.seriesIndex ?? -Infinity;
  return (
    books
      .filter((b) => b.id !== book.id && b.series && norm(b.series) === series && b.status !== "finished" && (b.seriesIndex ?? Infinity) > after)
      .sort((a, b) => (a.seriesIndex ?? Infinity) - (b.seriesIndex ?? Infinity))[0] ?? null
  );
}
