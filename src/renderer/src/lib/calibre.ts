import type { Book } from "../../../shared/types";
import { plainText } from "./util";

/*
 * Calibre keeps each book in a folder of its own, with every format of it, a
 * cover.jpg and a metadata.opf: the details as they were set in Calibre. Those
 * are someone's own corrections, so they count for more than what's inside the
 * files, where authors are often missing, turned round, or "Unknown".
 */

/** The details in a Calibre metadata.opf, as a book's. */
export function readCalibreOpf(xml: string): Partial<Book> {
  // The declaration says nothing needed here, and some parsers balk at Calibre's single quotes in it.
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF?\s*<\?xml[^>]*\?>/, ""), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return {};
  const all = [...doc.getElementsByTagName("*")];
  const elements = (name: string) => all.filter((el) => el.localName === name);
  const text = (name: string) => elements(name)[0]?.textContent?.trim() || undefined;
  const meta = (name: string) => all.find((el) => el.localName === "meta" && el.getAttribute("name") === name)?.getAttribute("content")?.trim() || undefined;
  // opf:role and opf:scheme, however the parser splits the prefix off.
  const attribute = (el: Element, name: string) =>
    [...el.attributes].find((a) => a.localName === name || a.name.endsWith(`:${name}`))?.value.toLowerCase();
  const scheme = (el: Element) => attribute(el, "scheme");
  const role = (el: Element) => attribute(el, "role");

  const out: Partial<Book> = {};
  const title = text("title");
  if (title) out.title = title;
  // Only the authors, not editors or illustrators; a creator with no role is an author.
  const authors = elements("creator")
    .filter((el) => !role(el) || role(el) === "aut")
    .map((el) => el.textContent?.trim() ?? "")
    .filter((name) => name && !/^unknown$/i.test(name));
  if (authors.length) out.authors = authors;
  const series = meta("calibre:series");
  if (series) {
    out.series = series;
    const index = parseFloat(meta("calibre:series_index") ?? "");
    if (Number.isFinite(index)) out.seriesIndex = index;
  }
  const tags = elements("subject").map((el) => el.textContent?.trim() ?? "").filter(Boolean);
  if (tags.length) out.tags = tags;
  // Calibre counts half stars, out of ten.
  const rating = Math.round(parseFloat(meta("calibre:rating") ?? "") / 2);
  if (rating >= 1 && rating <= 5) out.rating = rating;
  const description = plainText(text("description"));
  if (description) out.description = description;
  const publisher = text("publisher");
  if (publisher) out.publisher = publisher;
  // Calibre writes the year 101 for "no date".
  const date = text("date");
  if (date && parseInt(date, 10) >= 1000) out.published = date.slice(0, 10);
  const language = text("language");
  if (language && language !== "und") out.language = language;
  const isbn = elements("identifier")
    .filter((el) => scheme(el) === "isbn")
    .map((el) => (el.textContent ?? "").replace(/[^0-9X]/gi, ""))
    .find((x) => x.length === 10 || x.length === 13);
  if (isbn) out.isbn = isbn;
  return out;
}
