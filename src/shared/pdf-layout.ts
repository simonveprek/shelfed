/*
 * A PDF's pages as a book's chapters. A PDF only knows where each piece of
 * text sits, so the book is rebuilt from that: lines from pieces on one
 * baseline, the reading order of two columns, paragraphs from gaps and
 * indents, headings from the type's size, and chapters from the bookmarks or
 * the headings. What every page repeats, its running head and page number, is
 * left out, and a word broken over two lines is joined back up.
 *
 * Nothing here knows pdf.js: the pages come in already read, so it all runs
 * and is tested on its own.
 */

/** A piece of text where the PDF put it, from the top left, in points, to its baseline. */
export type PdfItem = { text: string; x: number; y: number; width: number; size: number; bold?: boolean; italic?: boolean };

/** A picture on a page, from the top left, in points. */
export type PdfPicture = { x: number; y: number; width: number; height: number };

export type PdfPage = { number: number; width: number; height: number; items: PdfItem[]; pictures: PdfPicture[] };

/** A bookmark: where it goes, and how deep it sits. */
export type PdfMark = { title: string; page: number; depth: number };

export type Run = { text: string; bold?: boolean; italic?: boolean; sup?: boolean };

export type Block =
  | { kind: "h1" | "h2" | "h3" | "p" | "li"; runs: Run[]; page: number }
  | { kind: "picture"; page: number; picture: PdfPicture; whole: boolean };

export type PdfOptions = {
  /** Leaves out running heads, feet and page numbers. */
  tidy: boolean;
  /** Joins words broken over two lines with a hyphen. */
  join: boolean;
  /** Takes bigger or bold lines on their own as headings. */
  headings: boolean;
  pictures: boolean;
  /** Where chapters begin: at bookmarks, at headings, or every few pages. */
  chapters: "marks" | "headings" | "pages";
  every: number;
  /** The pages to take, counted from 1. */
  from: number;
  to: number;
};

export type PdfChapter = { title: string; first: number; last: number; blocks: Block[] };

export type Laid = {
  chapters: PdfChapter[];
  /** Pictures of pages, with no words to reflow. */
  scanned: boolean;
  /** Running heads, feet and page numbers left out. */
  tidied: number;
  /** Whether there are bookmarks to make chapters from. */
  marked: boolean;
};

/** Words the layout needs, in the reader's language. */
export type Labels = { start: string; pages: (first: number, last: number) => string };

export const defaultOptions = (pages: number, marked: boolean): PdfOptions => ({
  tidy: true,
  join: true,
  headings: true,
  pictures: true,
  chapters: marked ? "marks" : "headings",
  every: 20,
  from: 1,
  to: pages,
});

type Line = { page: number; y: number; x: number; right: number; size: number; runs: Run[]; text: string; bold: boolean };

const SENTENCE_END = /[.!?:;"”’)»…]$/;
const BULLET = /^[•◦▪‣●○■□➢►–—*]\s+/;
const PAGE_NUMBER = /^[-–—\s]*(page\s+|p\.\s*|strana\s+)?([0-9]{1,4}|[ivxlcdm]{1,7})(\s*(of|\/|z)\s*[0-9]{1,4})?[-–—\s]*$/i;

const clean = (text: string) =>
  text
    .normalize("NFKC")
    // Control characters a PDF sometimes leaves in, but not the soft hyphen, which joins words.
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​﻿]/g, "");

/** Joins a run onto the end of others, merging it with the last when it looks the same. */
function append(runs: Run[], run: Run) {
  const last = runs[runs.length - 1];
  if (last && Boolean(last.bold) === Boolean(run.bold) && Boolean(last.italic) === Boolean(run.italic) && Boolean(last.sup) === Boolean(run.sup)) last.text += run.text;
  else runs.push({ ...run });
}

const textOf = (runs: Run[]) => runs.map((r) => r.text).join("");

/**
 * A page's lines: pieces on one baseline, left to right, spaced as they sit.
 * Pieces far apart on one baseline are separate lines, as two columns are.
 */
export function linesOf(page: PdfPage): Line[] {
  const items = page.items.map((item) => ({ ...item, text: clean(item.text) })).filter((item) => item.text.trim() && item.size > 0);
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: (typeof items)[] = [];
  for (const item of items) {
    const row = rows[rows.length - 1];
    const base = row?.reduce((big, i) => (i.size > big.size ? i : big), row[0]);
    if (base && Math.abs(item.y - base.y) <= Math.max(base.size, item.size) * 0.5) row.push(item);
    else rows.push([item]);
  }
  const lines: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const base = row.reduce((big, i) => (i.text.length * i.size > big.text.length * big.size ? i : big), row[0]);
    let segment: typeof row = [];
    const finish = () => {
      if (!segment.length) return;
      const runs: Run[] = [];
      let end = -Infinity;
      for (const item of segment) {
        const raised = item.size < base.size * 0.8 && base.y - item.y > base.size * 0.15;
        const gap = item.x - end;
        const prev = runs[runs.length - 1]?.text ?? "";
        // A space between words in two styles belongs to neither.
        const before = runs[runs.length - 1];
        if (before && gap > item.size * 0.12 && !/\s$/.test(prev) && !/^\s/.test(item.text) && !raised)
          append(runs, { text: " ", ...(before.bold && item.bold ? { bold: true } : {}), ...(before.italic && item.italic ? { italic: true } : {}) });
        append(runs, { text: item.text, ...(item.bold ? { bold: true } : {}), ...(item.italic ? { italic: true } : {}), ...(raised ? { sup: true } : {}) });
        end = Math.max(end, item.x + item.width);
      }
      for (const run of runs) run.text = run.text.replace(/\s+/g, " ");
      const words = runs.filter((r) => !r.sup && r.text.trim());
      const chars = words.reduce((n, r) => n + r.text.length, 0);
      const boldChars = words.filter((r) => r.bold).reduce((n, r) => n + r.text.length, 0);
      const main = segment.filter((i) => i.size >= base.size * 0.8);
      lines.push({
        page: page.number,
        y: base.y,
        x: segment[0].x,
        right: end,
        size: Math.max(...main.map((i) => i.size)),
        runs,
        text: textOf(runs).trim(),
        bold: chars > 0 && boldChars / chars > 0.8,
      });
      segment = [];
    };
    let last = -Infinity;
    for (const item of row) {
      if (segment.length && item.x - last > Math.max(base.size * 2.5, 18)) finish();
      segment.push(item);
      last = Math.max(last, item.x + item.width);
    }
    finish();
  }
  return lines.filter((l) => l.text);
}

/**
 * The order a page reads in. Two columns read the left one down, then the
 * right one; a line across both, like a title, stays where it is above or
 * below them.
 */
export function readingOrder(lines: Line[], width: number): Line[] {
  const middle = width / 2;
  const right = lines.filter((l) => l.x >= middle * 0.9);
  const left = lines.filter((l) => l.right <= middle * 1.1 && l.x < middle * 0.9);
  if (right.length < 4 || left.length < 4) return [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  // The right column starts where most of its lines do.
  const starts = right.map((l) => Math.round(l.x / 4) * 4);
  const start = [...new Set(starts)].sort((a, b) => starts.filter((s) => s === b).length - starts.filter((s) => s === a).length)[0];
  const inRight = (l: Line) => Math.abs(l.x - start) < 24 || (l.x >= start - 24 && l.x > middle * 0.9);
  const columns = lines.filter((l) => inRight(l) || l.right <= start - 4);
  const across = lines.filter((l) => !columns.includes(l));
  if (columns.filter(inRight).length < 4) return [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = Math.min(...columns.map((l) => l.y));
  const byY = (a: Line, b: Line) => a.y - b.y;
  return [
    ...across.filter((l) => l.y < top).sort(byY),
    ...columns.filter((l) => !inRight(l)).sort(byY),
    ...columns.filter(inRight).sort(byY),
    ...across.filter((l) => l.y >= top).sort(byY),
  ];
}

const keyOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b[ivxlcdm]{1,7}\b/g, "#")
    .replace(/[0-9]+/g, "#")
    .trim();

/** The lines at the very top and bottom of pages that are running heads, feet or page numbers. */
export function runningLines(pages: Array<{ page: PdfPage; lines: Line[] }>): Set<Line> {
  const zone = (line: Line, page: PdfPage) => line.y < page.height * 0.1 || line.y > page.height * 0.9;
  const seen = new Map<string, number[]>();
  for (const { page, lines } of pages)
    for (const line of lines.filter((l) => zone(l, page))) {
      const key = keyOf(line.text);
      seen.set(key, [...(seen.get(key) ?? []), page.number]);
    }
  const running = new Set<Line>();
  for (const { page, lines } of pages)
    for (const line of lines.filter((l) => zone(l, page))) {
      if (PAGE_NUMBER.test(line.text)) {
        running.add(line);
        continue;
      }
      const on = [...new Set(seen.get(keyOf(line.text)) ?? [])];
      const near = on.filter((n) => n !== page.number && Math.abs(n - page.number) <= 3).length;
      if (on.length >= 3 && (on.length >= pages.length * 0.2 || near >= 2)) running.add(line);
    }
  return running;
}

/** The most common of a list of numbers, by how much each counts. */
function mode(values: Array<[number, number]>, fallback: number) {
  const tally = new Map<number, number>();
  for (const [value, weight] of values) tally.set(value, (tally.get(value) ?? 0) + weight);
  let best = fallback;
  let most = 0;
  for (const [value, weight] of tally) if (weight > most) [best, most] = [value, weight];
  return best;
}

const median = (values: number[], fallback: number) => {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Joins a line's words onto a block's, the way a broken word or a new line asks. */
function joinRuns(runs: Run[], next: Run[], join: boolean) {
  const last = runs[runs.length - 1];
  const first = next[0];
  if (!last || !first) return void next.forEach((r) => append(runs, r));
  const lead = first.text.replace(/^\s+/, "");
  if (last.text.endsWith("­")) {
    last.text = last.text.slice(0, -1);
  } else if (join && /\p{L}-$/u.test(last.text) && /^\p{Ll}/u.test(lead)) {
    last.text = last.text.slice(0, -1);
  } else if (!/\s$/.test(last.text)) {
    append(runs, { text: " ", bold: last.bold, italic: last.italic });
  }
  append(runs, { ...first, text: lead });
  next.slice(1).forEach((r) => append(runs, r));
}

const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The pages, laid out as chapters. */
export function layOut(all: PdfPage[], marks: PdfMark[], options: PdfOptions, labels: Labels): Laid {
  const pages = all.filter((p) => p.number >= options.from && p.number <= options.to);
  const read = pages.map((page) => ({ page, lines: readingOrder(linesOf(page), page.width) }));
  const running = options.tidy ? runningLines(read) : new Set<Line>();

  const body = read.flatMap(({ lines }) => lines.filter((l) => !running.has(l)));
  const size = mode(body.map((l) => [Math.round(l.size * 2) / 2, l.text.length]), 11);
  const spacing = median(
    read.flatMap(({ lines }) => {
      const kept = lines.filter((l) => !running.has(l) && Math.abs(l.size - size) < size * 0.15);
      return kept.slice(1).map((l, i) => l.y - kept[i].y).filter((gap) => gap > size * 0.6 && gap < size * 2.4);
    }),
    size * 1.25,
  );

  const blocks: Block[] = [];
  let prev: Line | null = null;
  let chars = 0;
  for (const { page, lines } of read) {
    const kept = lines.filter((l) => !running.has(l));
    chars += kept.reduce((n, l) => n + l.text.length, 0);
    // A column's left edge and right edge, from its ordinary lines.
    const plain = kept.filter((l) => Math.abs(l.size - size) < size * 0.15);
    const marginOf = (line: Line) => {
      const near = plain.filter((l) => Math.abs(l.x - line.x) < page.width * 0.3);
      return mode(near.map((l) => [Math.round(l.x), 1]), line.x);
    };
    const rightOf = (line: Line) => {
      const near = plain.filter((l) => Math.abs(l.x - line.x) < page.width * 0.3).map((l) => l.right);
      return near.length ? Math.max(...near) : line.right;
    };

    const pictures = options.pictures
      ? page.pictures
          .filter((p) => p.width >= 24 && p.height >= 24 && p.width * p.height >= page.width * page.height * 0.01)
          .sort((a, b) => a.y - b.y)
      : [];
    const place = (before: number) => {
      while (pictures.length && pictures[0].y < before) {
        const picture = pictures.shift()!;
        const whole = picture.width * picture.height > page.width * page.height * 0.5 && kept.length < 3;
        blocks.push({ kind: "picture", page: page.number, picture, whole });
        prev = null;
      }
    };

    for (const line of kept) {
      place(line.y);
      const ratio = line.size / size;
      const isolated = !prev || prev.page !== line.page || line.y - prev.y > spacing * 1.4;
      let kind: "h1" | "h2" | "h3" | "p" | "li" = "p";
      if (options.headings && line.text.length <= 200) {
        if (ratio >= 1.55) kind = "h1";
        else if (ratio >= 1.18) kind = "h2";
        else if (line.bold && ratio >= 0.95 && line.text.length < 90 && isolated && !/[.,;]$/.test(line.text)) kind = "h3";
      }
      let runs = line.runs.map((r) => ({ ...r }));
      if (kind === "p" && BULLET.test(line.text)) {
        kind = "li";
        runs[0] = { ...runs[0], text: runs[0].text.replace(/^\s*/, "").replace(BULLET, "") };
        runs = runs.filter((r) => r.text);
      }

      const last = blocks[blocks.length - 1];
      let carry = false;
      if (last && last.kind !== "picture" && prev) {
        const samePage = prev.page === line.page;
        const gap = samePage ? line.y - prev.y : 0;
        // A footnote mark after the last word doesn't hide where a sentence ended.
        const prevText = textOf(last.runs.filter((r) => !r.sup)).trim();
        if (kind !== "p" && kind !== "li") {
          // A heading over two lines is one heading.
          carry = last.kind === kind && samePage && gap > 0 && gap < line.size * 2;
        } else if (kind === "p" && (last.kind === "p" || last.kind === "li")) {
          const indent = line.x - marginOf(line);
          const indented = indent > size * 0.8 && indent < size * 8;
          const short = prev.right < rightOf(prev) - size * 2.5 && SENTENCE_END.test(prevText);
          const apart = samePage ? gap > spacing * 1.45 || gap < 0 : SENTENCE_END.test(prevText);
          carry = !indented && !short && !apart;
        }
      }
      if (carry && last && last.kind !== "picture") joinRuns(last.runs, runs, options.join);
      else blocks.push({ kind, runs, page: line.page });
      prev = line;
    }
    place(Infinity);
  }
  for (const block of blocks) if (block.kind !== "picture") block.runs = block.runs.map((r) => ({ ...r, text: r.text })).filter((r) => r.text);

  const scanned = chars < pages.length * 30 && blocks.some((b) => b.kind === "picture");
  const usable = marks.filter((m) => m.depth === 0 && m.page >= options.from && m.page <= options.to).sort((a, b) => a.page - b.page);
  const marked = usable.length >= 2;
  return { chapters: chapters(blocks, usable, marked, options, labels), scanned, tidied: running.size, marked };
}

const headingText = (block: Block) => (block.kind === "picture" ? "" : textOf(block.runs).trim());

/** Where chapters begin, and their names. */
function chapters(blocks: Block[], marks: PdfMark[], marked: boolean, options: PdfOptions, labels: Labels): PdfChapter[] {
  const starts: Array<{ at: number; title: string }> = [];
  let mode = options.chapters;
  if (mode === "marks" && !marked) mode = "headings";

  if (mode === "marks") {
    for (const mark of marks) {
      const want = normal(mark.title);
      const after = starts.length ? starts[starts.length - 1].at : -1;
      const onPage = blocks.findIndex((b, i) => i > after && b.page >= mark.page);
      if (onPage < 0) continue;
      // The heading the bookmark names, if it's on that page; otherwise the page's start.
      const named = blocks.findIndex((b, i) => i >= onPage && b.page === mark.page && b.kind !== "p" && b.kind !== "li" && b.kind !== "picture" && want && (normal(headingText(b)).includes(want) || want.includes(normal(headingText(b)))));
      starts.push({ at: named >= 0 && normal(headingText(blocks[named])) ? named : onPage, title: mark.title.trim() });
    }
  } else if (mode === "headings") {
    // The biggest headings there are two of, or failing that the one there is.
    const count = (kind: "h1" | "h2") => blocks.filter((b) => b.kind === kind).length;
    const level = (["h1", "h2"] as const).find((kind) => count(kind) >= 2) ?? (["h1", "h2"] as const).find((kind) => count(kind) === 1);
    if (level) blocks.forEach((b, i) => b.kind === level && starts.push({ at: i, title: headingText(b) }));
    else mode = "pages";
  }
  if (mode === "pages") {
    const every = Math.max(1, Math.round(options.every));
    for (let first = options.from; first <= options.to; first += every) {
      const at = blocks.findIndex((b) => b.page >= first);
      if (at >= 0 && !starts.some((s) => s.at === at)) starts.push({ at, title: labels.pages(first, Math.min(options.to, first + every - 1)) });
    }
  }

  starts.sort((a, b) => a.at - b.at);
  if (!starts.length || starts[0].at > 0) {
    const first = blocks.find((b) => b.kind === "h1" || b.kind === "h2");
    starts.unshift({ at: 0, title: first && blocks.indexOf(first) < (starts[0]?.at ?? Infinity) ? headingText(first) : labels.start });
  }
  return starts
    .map((start, i) => {
      const part = blocks.slice(start.at, starts[i + 1]?.at ?? blocks.length);
      const pagesIn = part.map((b) => b.page);
      return { title: start.title || labels.start, first: Math.min(...pagesIn), last: Math.max(...pagesIn), blocks: part };
    })
    .filter((c) => c.blocks.length);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function runsXhtml(runs: Run[]) {
  return runs
    .map((r) => {
      let html = esc(r.text);
      if (r.sup) html = `<sup>${html}</sup>`;
      if (r.italic) html = `<i>${html}</i>`;
      if (r.bold) html = `<b>${html}</b>`;
      return html;
    })
    .join("")
    .trim();
}

/** A chapter's blocks as XHTML, with each picture where pictureAt says it went. */
export function blocksXhtml(blocks: Block[], pictureAt: (block: Extract<Block, { kind: "picture" }>) => string | undefined): string {
  const out: string[] = [];
  let list = false;
  for (const block of blocks) {
    if (block.kind !== "li" && list) {
      out.push("</ul>");
      list = false;
    }
    if (block.kind === "picture") {
      const src = pictureAt(block);
      if (src) out.push(`<div class="${block.whole ? "page" : "picture"}"><img src="${esc(src)}" alt=""/></div>`);
    } else if (block.kind === "li") {
      if (!list) out.push("<ul>");
      list = true;
      out.push(`<li>${runsXhtml(block.runs)}</li>`);
    } else {
      const inner = runsXhtml(block.runs);
      if (inner) out.push(`<${block.kind}>${inner}</${block.kind}>`);
    }
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}

/** How a book made from a PDF lays out its pictures and whole pages. */
export const PDF_CSS = `
.picture { margin: 1em 0; text-align: center; }
.picture img { max-width: 100%; }
.page { margin: 0; text-align: center; page-break-after: always; }
.page img { max-width: 100%; max-height: 100vh; }
sup { font-size: 0.7em; line-height: 0; }
`;
