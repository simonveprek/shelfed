import type { Book } from "../../../shared/types";

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export const authorsOf = (book: Book) => (book.authors.length ? book.authors.join(", ") : "Unknown author");

export const thumbUrl = (book: Book) => `shelf://thumb/${book.id}?v=${book.cover}`;
export const coverUrl = (book: Book) => `shelf://cover/${book.id}?v=${book.cover}`;
export const fileUrl = (book: Book, ext: string) => `shelf://file/${book.id}/${ext}?v=${book.modified}`;

/** A book's file as a File, the way the readers and converters want it. */
export async function fetchFile(book: Book, ext: string) {
  const format = book.formats.find((f) => f.ext === ext);
  const res = await fetch(fileUrl(book, ext));
  if (!res.ok) throw new Error("The file is missing from the library folder.");
  return new File([await res.blob()], format?.file ?? `book.${ext}`);
}

// Dates in words, the way the rest of Shelf is written: 17 Jan 2021.
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const date = (t?: number) => (t ? DATE.format(t) : "");

/** A published date as books give it, a year, a month or a day, in words. */
export function published(value?: string) {
  const [, y, m, d] = value?.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/) ?? [];
  if (!y) return value ?? "";
  if (d) return DATE.format(Date.UTC(+y, +m - 1, +d));
  if (m) return MONTH.format(Date.UTC(+y, +m - 1));
  return y;
}

export function ago(t?: number) {
  if (!t) return "Never";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return Math.floor(s / 60) === 1 ? "A minute ago" : `${Math.floor(s / 60)} minutes ago`;
  if (s < 86400) return Math.floor(s / 3600) === 1 ? "An hour ago" : `${Math.floor(s / 3600)} hours ago`;
  if (s < 86400 * 2) return "Yesterday";
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} days ago`;
  return date(t);
}

/** Words without accents or case, for search and for matching titles. */
export const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** How alike two strings are, from 0 to 1, by shared letter pairs. */
export function similarity(a: string, b: string) {
  const grams = (s: string) => {
    const t = ` ${norm(s)} `;
    const out = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
    return out;
  };
  const x = grams(a);
  const y = grams(b);
  let shared = 0;
  let total = 0;
  for (const [g, n] of x) {
    shared += Math.min(n, y.get(g) ?? 0);
    total += n;
  }
  for (const n of y.values()) total += n;
  return total ? (2 * shared) / total : 0;
}

/** "The Hobbit" sorts as "Hobbit". */
export const sortTitle = (t: string) => norm(t).replace(/^(the|a|an|der|die|das|le|la|les|el)\s+/, "");

/** "J. R. R. Tolkien" sorts as "Tolkien". */
export const sortAuthor = (a?: string) => {
  if (!a) return "~";
  const parts = norm(a).split(" ");
  return `${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`;
};

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Waits for a pause before calling. flush() calls at once with the last arguments, for when the window closes. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  let last: A | null = null;
  const run = (...a: A) => {
    last = a;
    clearTimeout(t);
    t = setTimeout(() => {
      last = null;
      fn(...a);
    }, ms);
  };
  return Object.assign(run, {
    flush() {
      clearTimeout(t);
      if (last) {
        const a = last;
        last = null;
        fn(...a);
      }
    },
  });
}

/** Plain text from a description that may be HTML. */
export function plainText(html?: string) {
  if (!html) return undefined;
  if (!/<[a-z][\s\S]*>/i.test(html)) return html.trim();
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("p, br, div, li, h1, h2, h3").forEach((el) => el.append("\n"));
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export const FOLIATE = ["epub", "mobi", "azw3", "azw", "kf8", "prc", "fb2", "fbz", "cbz"];
export const TEXTUAL = ["txt", "md", "html", "xhtml", "docx"];

/** The file to open: the one the reader was last in, or the one that reads best. */
export function readingFormat(book: Book) {
  return book.readFormat && book.formats.some((f) => f.ext === book.readFormat) ? book.readFormat : bestFormat(book);
}

/** Which of a book's files reads best. */
export function bestFormat(book: Book) {
  for (const ext of ["epub", "azw3", "mobi", "azw", "fb2", "fbz", "cbz", "pdf", "docx", "md", "html", "txt"])
    if (book.formats.some((f) => f.ext === ext)) return ext;
  return book.formats[0]?.ext;
}

/** Time read, the way a person says it. */
export function duration(seconds: number) {
  if (seconds < 60) return seconds > 0 ? "Under a minute" : "None yet";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (!h) return `${m} min`;
  if (h >= 10) return `${h} h`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
