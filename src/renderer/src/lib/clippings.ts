import type { Annotation, Book } from "../../../shared/types";
import { newAnnotationId } from "./annotations";
import { norm, similarity } from "./util";

/*
 * Kindle keeps every highlight, note and bookmark in one text file,
 * My Clippings.txt. Each clipping is a title line, a line saying what and
 * where, an empty line, the words, and a row of equals signs.
 */

export type Clipping = {
  title: string;
  author?: string;
  kind: "highlight" | "note" | "bookmark";
  where?: string;
  text: string;
  added?: number;
};

export function parseClippings(raw: string): Clipping[] {
  const out: Clipping[] = [];
  for (const block of raw.replace(/^﻿/, "").replace(/\r/g, "").split(/\n?={6,}\n?/)) {
    const lines = block.replace(/^﻿/, "").split("\n").map((l) => l.trim());
    while (lines.length && !lines[0]) lines.shift();
    if (lines.length < 2) continue;
    const head = lines[0];
    const meta = lines[1];
    // "Title (Author)", where the title itself may hold parentheses.
    const m = head.match(/^(.*)\(([^()]*)\)\s*$/);
    const title = (m ? m[1] : head).replace(/^﻿/, "").trim();
    const author = m?.[2]?.trim();
    const kind = /note/i.test(meta) ? "note" : /bookmark/i.test(meta) ? "bookmark" : "highlight";
    const where = meta
      .replace(/^-\s*/, "")
      .split("|")
      .map((p) => p.trim())
      .filter((p) => !/^added on/i.test(p))
      .map((p) => p.replace(/^your (highlight|note|bookmark)\s*/i, "").replace(/^on\s+/i, ""))
      .join(", ");
    const addedText = meta.split("|").find((p) => /added on/i.test(p))?.replace(/.*added on\s*/i, "").trim();
    const added = addedText ? Date.parse(addedText.replace(/^\w+,\s*/, "")) : NaN;
    const text = lines.slice(2).join("\n").trim();
    if (kind !== "bookmark" && !text) continue;
    out.push({ title, author, kind, where: where || undefined, text, added: Number.isFinite(added) ? added : undefined });
  }
  return out;
}

export type ClippingGroup = { title: string; author?: string; clippings: Clipping[]; book?: Book };

/** Clippings gathered by book, each matched to the library when the title and author agree. */
export function groupClippings(clippings: Clipping[], books: Book[]): ClippingGroup[] {
  const groups = new Map<string, ClippingGroup>();
  for (const c of clippings) {
    const key = `${c.title}|${c.author ?? ""}`;
    const g = groups.get(key) ?? { title: c.title, author: c.author, clippings: [] };
    g.clippings.push(c);
    groups.set(key, g);
  }
  // Books by the longer words of their titles, so each Kindle title is only
  // scored against the few books that could be it.
  const words = (t: string) => norm(t).split(" ").filter((w) => w.length > 3);
  const byWord = new Map<string, Book[]>();
  for (const book of books)
    for (const w of new Set(words(book.title))) {
      const list = byWord.get(w);
      if (list) list.push(book);
      else byWord.set(w, [book]);
    }
  for (const g of groups.values()) {
    const candidates = new Set(words(g.title).flatMap((w) => byWord.get(w) ?? []));
    let best: { book: Book; score: number } | null = null;
    for (const book of candidates) {
      const t = Math.max(similarity(g.title, book.title), similarity(g.title.split(/[:(]/)[0], book.title.split(/[:(]/)[0]));
      const a = g.author && book.authors.length ? Math.max(...book.authors.map((x) => similarity(x, g.author!.split(";")[0]))) : 0.6;
      const score = t * 0.75 + a * 0.25;
      if (!best || score > best.score) best = { book, score };
    }
    if (best && best.score > 0.72) g.book = best.book;
  }
  return [...groups.values()].sort((a, b) => Number(Boolean(b.book)) - Number(Boolean(a.book)) || b.clippings.length - a.clippings.length);
}

/** The first and last Kindle location a clipping covers, like 312 and 314. */
function span(where?: string): [number, number] | null {
  const m = where?.match(/location\s*(\d+)(?:-(\d+))?/i) ?? where?.match(/(\d+)(?:-(\d+))?/);
  if (!m) return null;
  const from = Number(m[1]);
  return [from, m[2] ? Number(m[2]) : from];
}

/** The same Kindle clipping, however many times it is imported. */
const keyOf = (a: { where?: string; text?: string; note?: string }) => (a.text ? `${a.where}|${a.text}` : `${a.where}|note|${a.note}`);

/**
 * Turns a book's clippings into annotations, leaving out any it already has.
 * A note is joined to the highlight whose locations hold it, whether Kindle
 * wrote the note before the highlight or after it.
 */
export function toAnnotations(group: ClippingGroup, existing: Annotation[] = []): Annotation[] {
  const highlights = group.clippings.filter((c) => c.kind === "highlight");
  const notes = group.clippings.filter((c) => c.kind === "note");
  const out = new Map<Clipping, Annotation>();
  for (const c of highlights)
    out.set(c, { id: newAnnotationId(), kind: "kindle", text: c.text, where: c.where, created: c.added ?? Date.now() });
  for (const n of notes) {
    const at = span(n.where)?.[1];
    const owner = at === undefined ? undefined : highlights.find((h) => {
      const s = span(h.where);
      return s && at >= s[0] && at <= s[1] + 1;
    });
    if (owner) out.get(owner)!.note = n.text;
    else out.set(n, { id: newAnnotationId(), kind: "kindle", note: n.text, where: n.where, created: n.added ?? Date.now() });
  }
  const seen = new Set(existing.filter((a) => a.kind === "kindle").map(keyOf));
  return [...out.values()].filter((a) => {
    const key = keyOf(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
