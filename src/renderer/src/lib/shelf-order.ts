import type { Book } from "../../../shared/types";

/*
 * How books are arranged on the shelves of the 3D bookcase: which lie in the
 * reading pile, which series stand together, and the order of colours.
 */

/** The most books a pile can hold before it stops looking like a pile. */
const PILE = 5;

/** The books lying on top of the case: what's being read now, the latest first. */
export function readingPile(books: Book[]) {
  return books
    .filter((b) => b.status === "reading")
    .sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0))
    .slice(0, PILE);
}

/** The series with at least two books here, which is what makes a set. */
export function boxSets(books: Book[]) {
  const counts = new Map<string, number>();
  for (const book of books) if (book.series) counts.set(book.series, (counts.get(book.series) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= 2).map(([series]) => series));
}

/** Brings each set together where its first book stands, in reading order. Everything else stays put. */
export function standTogether(books: Book[], sets: ReadonlySet<string>) {
  const members = new Map<string, Book[]>();
  for (const book of books) {
    if (!book.series || !sets.has(book.series)) continue;
    const list = members.get(book.series);
    if (list) list.push(book);
    else members.set(book.series, [book]);
  }
  const placed = new Set<string>();
  const out: Book[] = [];
  for (const book of books) {
    if (!book.series || !sets.has(book.series)) {
      out.push(book);
      continue;
    }
    if (placed.has(book.series)) continue;
    placed.add(book.series);
    out.push(...members.get(book.series)!.sort((a, b) => (a.seriesIndex ?? Infinity) - (b.seriesIndex ?? Infinity)));
  }
  return out;
}

/** A colour's place in the rainbow, or null for anything that isn't plain hex. */
export function hueOf(colour: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(colour);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const light = (max + min) / 2;
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (chroma) {
    if (max === r) hue = ((g - b) / chroma + 6) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
  }
  return { hue: hue * 60, saturation, light };
}

/**
 * Books in rainbow order. Colours too grey or too dark to have a hue of their
 * own go at the end, from light to dark, the way someone would shelve them by eye.
 */
export function rainbowOrder<T>(items: T[], colourOf: (item: T) => string) {
  const rated = items.map((item) => ({ item, colour: hueOf(colourOf(item)) }));
  const vivid = (c: ReturnType<typeof hueOf>) => Boolean(c && c.saturation >= 0.15 && c.light > 0.12 && c.light < 0.92);
  const key = (c: ReturnType<typeof hueOf>) => (vivid(c) ? c!.hue : 1000 + (1 - (c?.light ?? 0)));
  return rated.sort((a, b) => key(a.colour) - key(b.colour)).map((r) => r.item);
}
