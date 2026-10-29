import { useDeferredValue, useMemo } from "react";
import type { Book, SortKey } from "../../../shared/types";
import { useStore, type Browse, type Section } from "./store";
import { norm, sortAuthor, sortTitle } from "./util";
import { useOnKindle } from "./kindle";
import { t } from "../../../shared/i18n";

const FORTNIGHT = 1000 * 60 * 60 * 24 * 14;

export function groupKeys(book: Book, by: Browse) {
  switch (by) {
    case "author":
      return book.authors.length ? book.authors : [t("Unknown author")];
    case "series":
      return book.series ? [book.series] : [];
    case "tag":
      return book.tags;
    case "format":
      return book.formats.map((f) => f.ext.toUpperCase());
  }
}

export function inSection(book: Book, section: Section, onKindle?: Set<string> | null) {
  switch (section.kind) {
    case "kindle":
      return Boolean(onKindle?.has(book.id));
    case "all":
    case "browse":
    case "discover":
      return true;
    case "reading":
    case "unread":
    case "finished":
      return book.status === section.kind;
    case "favorites":
      return book.favorite;
    case "recent":
      return Date.now() - book.added < FORTNIGHT;
    case "collection":
      return book.collections.includes(section.id);
    case "group":
      return groupKeys(book, section.by).includes(section.value);
  }
}

/** A search index per book, built once per change of the book. */
const index = new WeakMap<Book, string>();
const haystack = (b: Book) => {
  let s = index.get(b);
  if (!s) {
    s = norm([b.title, ...b.authors, b.series ?? "", ...b.tags, b.publisher ?? "", b.isbn ?? "", ...b.formats.map((f) => f.ext)].join(" "));
    index.set(b, s);
  }
  return s;
};

export const matches = (book: Book, query: string) => !query || norm(query).split(" ").every((word) => haystack(book).includes(word));

const keys: Record<SortKey, (b: Book) => string | number> = {
  added: (b) => b.added,
  title: (b) => sortTitle(b.title),
  author: (b) => `${sortAuthor(b.authors[0])} ${b.series ?? ""}${String(b.seriesIndex ?? 0).padStart(4, "0")}${sortTitle(b.title)}`,
  rating: (b) => b.rating,
  opened: (b) => b.opened ?? 0,
  series: (b) => (b.series ? norm(b.series) + String(b.seriesIndex ?? 0).padStart(4, "0") : "~"),
  progress: (b) => b.progress ?? 0,
  size: (b) => b.formats.reduce((n, f) => n + f.size, 0),
};

export function sortBooks(books: Book[], key: SortKey, dir: "asc" | "desc") {
  const value = keys[key];
  const sign = dir === "asc" ? 1 : -1;
  return books
    .map((b) => [value(b), b] as const)
    .sort(([a], [b]) => (a < b ? -sign : a > b ? sign : 0))
    .map(([, b]) => b);
}

/** The books on screen, filtered, searched and sorted. */
export function useVisibleBooks() {
  const books = useStore((s) => s.books);
  const section = useStore((s) => s.section);
  const query = useDeferredValue(useStore((s) => s.query));
  const sort = useStore((s) => s.settings.sort);
  const dir = useStore((s) => s.settings.sortDir);
  const onKindle = useOnKindle();
  return useMemo(() => {
    const found = books.filter((b) => inSection(b, section, onKindle) && matches(b, query));
    // Series read best in order, whatever the sort.
    if (section.kind === "group" && section.by === "series") return sortBooks(found, "series", "asc");
    return sortBooks(found, sort, dir);
  }, [books, section, query, sort, dir, onKindle]);
}

export function sectionTitle(section: Section, collections: { id: string; name: string }[]) {
  switch (section.kind) {
    case "all": return t("All books");
    case "reading": return t("Reading");
    case "unread": return t("Want to read");
    case "finished": return t("Finished");
    case "favorites": return t("Favorites");
    case "recent": return t("Recently added");
    case "collection": return collections.find((c) => c.id === section.id)?.name ?? t("Collection");
    case "browse": return t({ author: "Authors", series: "Series", tag: "Tags", format: "Formats" }[section.by]);
    case "discover": return t("Classics");
    case "kindle": return t("On your Kindle");
    case "group": return section.value;
  }
}
