/*
 * Many ebooks keep their series in the title rather than in a field of its
 * own: "The King of the West: (Path of the Ranger Book 7)". Only a series that
 * comes with its number, said plainly, is taken: "(Series Book 7)", "(Series,
 * #7)", "Series, Book 7", "Series Vol. 7". A title like "Stories: Part Two"
 * or "1984" is left as it is.
 */

/** Words alone, without case, accents or punctuation, for telling whether two names are the same. */
export const plainWords = (text: string) =>
  text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const NUMBER = `(\\d+(?:\\.\\d+)?|${WORDS.join("|")})`;
const MARK = `(?:book|bk\\.?|vol(?:ume)?\\.?|#|no\\.)`;

const PATTERNS = [
  // The King of the West: (Path of the Ranger Book 7) · Title [Series, #3] · Title (Series #3)
  new RegExp(`^(.+?)[\\s:,;–—-]*[([]\\s*([^()[\\]]+?)[\\s,]*${MARK}\\s*#?\\s*${NUMBER}\\s*[)\\]]\\s*$`, "i"),
  // Title: Series, Book 7 · Title - Series Vol. 2
  new RegExp(`^(.+?)\\s*[:–—]\\s*([^:–—]+?)[\\s,]+${MARK}\\s*#?\\s*${NUMBER}\\s*$`, "i"),
];

export type SeriesInTitle = { title: string; series: string; index: number };

/** The series a title carries, and the title without it, or null when it carries none. */
export function seriesInTitle(raw: string): SeriesInTitle | null {
  const text = raw.trim();
  for (const pattern of PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const title = match[1].replace(/[\s:,;–—-]+$/, "").trim();
    const series = match[2].replace(/^the\s+series\s+/i, "").replace(/\s+series$/i, "").replace(/[\s,]+$/, "").trim();
    const number = match[3].toLowerCase();
    const index = WORDS.includes(number) ? WORDS.indexOf(number) + 1 : parseFloat(number);
    // A series needs a name of its own, apart from the title, and a sensible number.
    if (!title || !series || !/\p{L}/u.test(series) || !Number.isFinite(index) || index <= 0 || index > 999) continue;
    if (plainWords(series) === plainWords(title)) continue;
    return { title, series, index };
  }
  return null;
}

/**
 * What a book with its series in the title should become: the clean title,
 * and the series and number, unless it already has a different series, which
 * someone chose on purpose.
 */
export function seriesFix(book: { title: string; series?: string; seriesIndex?: number }) {
  const found = seriesInTitle(book.title);
  if (!found) return null;
  if (book.series && plainWords(book.series) !== plainWords(found.series)) return null;
  return {
    title: found.title,
    series: book.series || found.series,
    seriesIndex: book.seriesIndex ?? found.index,
  };
}
