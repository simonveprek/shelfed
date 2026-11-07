import type { KindleModel } from "./kindles";

/*
 * E-readers besides Kindles. Kobo and PocketBook open as a drive when plugged
 * in, and read EPUB as it is, so a book goes across without being made into
 * anything first. Both find books anywhere on the drive outside their own
 * folders, so Shelfed puts them at the top, the way Kobo says to.
 */

export type ReaderKind = "kobo" | "pocketbook";

export type Reader = {
  /** Its maker's name, the same in every language. */
  name: string;
  /** What it reads and Shelfed can give it, the best first. */
  reads: string[];
  /** Folders at the top of its drive that are its own, never books: hidden ones, its settings, Adobe's. */
  own: RegExp;
  /** How it looks in 3D. */
  model: KindleModel;
};

export const READERS: Record<ReaderKind, Reader> = {
  kobo: {
    name: "Kobo",
    // It reads MOBI, text and web pages too, but EPUB far better, so those get one made.
    reads: ["epub", "cbz", "pdf"],
    own: /^(\..*|digital editions)$/i,
    // Something like a Libra, the Kobo with page buttons.
    model: { id: "kobo", name: "Kobo", year: 2023, size: [145, 162, 9], screen: 7, shape: "kobo", finishes: ["white"], codes: [] },
  },
  pocketbook: {
    name: "PocketBook",
    reads: ["epub", "fb2", "azw3", "mobi", "docx", "cbz", "pdf", "txt", "html"],
    own: /^(\..*|system|digital editions|screenshots)$/i,
    // Something like a Verse, buttons and all.
    model: { id: "pocketbook", name: "PocketBook", year: 2023, size: [108, 156, 8.5], screen: 6, shape: "pocketbook", finishes: ["denim"], codes: [] },
  },
};

/** Formats whose words reflow, so an EPUB can be made from them. */
const REFLOWS = ["epub", "mobi", "azw3", "azw", "kf8", "prc", "fb2", "fbz", "cbz", "txt", "md", "html", "xhtml", "docx"];

/**
 * Which of a book's files goes to an e-reader: one it reads as it is, or an
 * EPUB made first. A PDF goes as it is only when there's nothing that reflows
 * to make an EPUB from. Nothing, when there's neither.
 */
export function readerFile(formats: string[], reader: Reader, canMakeEpub: boolean): { ext: string; convert: boolean } | null {
  const own = reader.reads.find((ext) => formats.includes(ext));
  const reflows = formats.some((ext) => REFLOWS.includes(ext));
  if (own && (own !== "pdf" || !reflows)) return { ext: own, convert: false };
  if (canMakeEpub) return { ext: "epub", convert: true };
  if (own) return { ext: own, convert: false };
  return null;
}

export const isReaderKind = (kind: unknown): kind is ReaderKind => kind === "kobo" || kind === "pocketbook";

/** The book files an e-reader other than a Kindle holds, as Shelfed can read them. */
const ON_READER = /\.(epub|fb2|fbz|mobi|azw3?|prc|cbz|pdf|txt|docx|html?)$/i;

export const isReaderBook = (path: string) => ON_READER.test(path);
