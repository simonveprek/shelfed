import type { Book } from "../../../shared/types";
import { api } from "./api";
import { type Chapter, type Content, extOf, sniff } from "./epub";
import { FOLIATE, fetchFile, plainText } from "./util";

// pdf.js is large, so it loads the first time a PDF needs it.
const pdf = () => import("./pdf");

/* ------------------------------------------------------------------------ */
/* Reading a file with foliate                                               */
/* ------------------------------------------------------------------------ */

type LangMap = string | Record<string, string> | undefined;
type Contributor = string | { name?: LangMap } | undefined;

export type FoliateBook = {
  metadata?: Record<string, any>;
  sections: Array<{ id?: string; load: () => Promise<string>; unload?: () => void }>;
  toc?: Array<{ label: string; href: string }>;
  getCover?: () => Promise<Blob | null | undefined>;
  destroy?: () => void;
  splitTOCHref?: (href: string) => [string | number, unknown];
};

export async function openFoliate(file: File): Promise<FoliateBook> {
  const { makeBook } = await import("foliate-js/view.js");
  return makeBook(file);
}

const fromMap = (x: LangMap) => (!x ? "" : typeof x === "string" ? x : (Object.values(x)[0] ?? ""));
const fromContributor = (c: Contributor) => (typeof c === "string" ? c : fromMap(c?.name));
const list = <T,>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** Shelfed's fields from foliate's metadata. */
function readMetadata(m: Record<string, any> = {}): Partial<Book> {
  const isbn = [...list<any>(m.identifier), ...list<any>(m.altIdentifier)]
    .map((x) => String(typeof x === "string" ? x : (x?.value ?? "")))
    .map((x) => x.replace(/^urn:isbn:/i, "").replace(/[^0-9X]/gi, ""))
    .find((x) => x.length === 13 || x.length === 10);
  const series = list<any>(m.belongsTo?.series).find((s) => s?.name);
  const out: Partial<Book> = {
    title: fromMap(m.title).trim() || undefined,
    authors: list<Contributor>(m.author).map(fromContributor).map((a) => a.trim()).filter(Boolean),
    publisher: fromContributor(list<Contributor>(m.publisher)[0]) || undefined,
    published: typeof m.published === "string" ? m.published.slice(0, 10) : undefined,
    language: list<string>(m.language)[0],
    description: plainText(typeof m.description === "string" ? m.description : undefined),
    tags: list<Contributor>(m.subject).map(fromContributor).filter(Boolean).slice(0, 8),
    isbn,
  };
  if (series) {
    out.series = fromMap(series.name);
    const position = parseFloat(series.position);
    if (Number.isFinite(position)) out.seriesIndex = position;
  }
  if (m.subtitle && out.title) out.title = `${out.title}: ${fromMap(m.subtitle)}`;
  for (const key of Object.keys(out) as (keyof Book)[]) {
    const value = out[key];
    if (value === undefined || (key === "authors" && !(value as string[]).length)) delete out[key];
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Details and covers on import                                              */
/* ------------------------------------------------------------------------ */

export async function parseBook(book: Book): Promise<{ patch: Partial<Book>; cover: Blob | null }> {
  const ext = book.formats[0].ext;
  const file = await fetchFile(book, ext);
  if (FOLIATE.includes(ext)) {
    const fb = await openFoliate(file);
    const patch = readMetadata(fb.metadata);
    const cover = (await fb.getCover?.().catch(() => null)) ?? null;
    fb.destroy?.();
    return { patch, cover };
  }
  if (ext === "pdf") {
    const { openPdf, renderPage, closePdf } = await pdf();
    const doc = await openPdf(await file.arrayBuffer());
    const meta = (await doc.getMetadata().catch(() => null)) as { info?: Record<string, string> } | null;
    const info = meta?.info ?? {};
    const patch: Partial<Book> = {};
    // Many PDFs carry junk titles like "Microsoft Word, draft.doc", so those are skipped.
    if (info.Title && !/^(untitled|microsoft|document|\s*$)/i.test(info.Title) && info.Title.length < 200) patch.title = info.Title.trim();
    if (info.Author && info.Author.length < 120) patch.authors = info.Author.split(/\s*[;&]\s*|\s+and\s+/).filter(Boolean);
    const cover = await renderPage(doc, 1, 900).catch(() => null);
    closePdf(doc);
    return { patch, cover };
  }
  if (ext === "md" || ext === "txt") {
    const heading = (await file.text()).match(/^#\s+(.+)$/m)?.[1];
    return { patch: heading ? { title: heading.trim() } : {}, cover: null };
  }
  if (ext === "html" || ext === "xhtml") {
    const doc = new DOMParser().parseFromString(await file.text(), "text/html");
    const title = (doc.title || doc.querySelector("h1")?.textContent || "").trim();
    const author = doc.querySelector('meta[name="author"]')?.getAttribute("content");
    return { patch: { ...(title ? { title } : {}), ...(author ? { authors: [author] } : {}) }, cover: null };
  }
  return { patch: {}, cover: null };
}

/** A cover at full size, a small one for the grid, and the colour it leans to. */
export async function processCover(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const draw = (maxW: number, maxH: number, quality: number) => {
    const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  };
  const [cover, thumb] = await Promise.all([draw(1400, 2100, 0.9), draw(440, 660, 0.82)]);

  // The tint is the average of the cover's livelier pixels, so a white border never wins.
  const small = new OffscreenCanvas(24, 36);
  const sctx = small.getContext("2d")!;
  sctx.drawImage(bitmap, 0, 0, 24, 36);
  const px = sctx.getImageData(0, 0, 24, 36).data;
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < px.length; i += 4) {
    const weight = 0.15 + (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2])) / 255;
    r += px[i] * weight;
    g += px[i + 1] * weight;
    b += px[i + 2] * weight;
    w += weight;
  }
  bitmap.close();
  const hex = (n: number) => Math.round(n / w).toString(16).padStart(2, "0");
  return {
    cover: new Uint8Array(await cover.arrayBuffer()),
    thumb: new Uint8Array(await thumb.arrayBuffer()),
    tint: `#${hex(r)}${hex(g)}${hex(b)}`,
  };
}

export async function saveCover(id: string, blob: Blob) {
  const { cover, thumb, tint } = await processCover(blob);
  return api.setCover(id, cover, thumb, tint);
}

/* ------------------------------------------------------------------------ */
/* A whole book as Content, for converting and reading                       */
/* ------------------------------------------------------------------------ */

const XHTML = "http://www.w3.org/1999/xhtml";
const serializer = new XMLSerializer();

/** A body as XHTML a strict EPUB reader accepts. */
function bodyToXhtml(body: Element) {
  const doc = document.implementation.createDocument(XHTML, "html", null);
  const holder = doc.createElementNS(XHTML, "body");
  for (const node of Array.from(body.childNodes)) holder.appendChild(doc.importNode(node, true));
  doc.documentElement.appendChild(holder);
  return serializer
    .serializeToString(holder)
    .replace(/^<body[^>]*>/, "")
    .replace(/<\/body>$/, "")
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "");
}

function cleanBody(doc: Document) {
  doc.querySelectorAll("script, iframe, object, embed, form, input, button, link, meta, style").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes))
      if (/^on/i.test(attr.name) || (attr.name === "href" && /^(blob:|javascript:)/.test(attr.value))) el.removeAttribute(attr.name);
  });
}

function titleOf(doc: Document | Element, fallback: string) {
  const text = doc.querySelector("h1, h2, h3, .chapter-title, .title")?.textContent?.replace(/\s+/g, " ").trim();
  return text && text.length < 140 ? text : fallback;
}

/** Collects pictures out of a document into the book, rewriting their links. */
async function takeImages(doc: Document, images: Content["images"]) {
  for (const el of Array.from(doc.querySelectorAll("img[src], image"))) {
    const isImg = el.tagName.toLowerCase() === "img";
    const src = isImg ? el.getAttribute("src") : (el.getAttribute("href") ?? el.getAttributeNS("http://www.w3.org/1999/xlink", "href"));
    if (!src || src.startsWith("images/")) continue;
    if (!/^(blob:|data:)/.test(src)) {
      el.remove();
      continue;
    }
    try {
      const data = new Uint8Array(await (await fetch(src)).arrayBuffer());
      const type = sniff(data);
      const path = `images/img${images.size + 1}.${extOf(type)}`;
      images.set(path, { data, type });
      if (isImg) el.setAttribute("src", path);
      else if (el.hasAttribute("href")) el.setAttribute("href", path);
      else el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", path);
    } catch {
      el.remove();
    }
  }
}

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text split into chapters at lines that read like chapter headings. */
function textToChapters(text: string): Chapter[] {
  const heading = /^\s*(chapter|kapitola|part|book|prologue|epilogue|kapitel|chapitre|capítulo|část)\b[^\n]{0,60}$/i;
  const blocks = /\n\s*\n/.test(text) ? text.split(/\n\s*\n/) : text.split(/\n/);
  const chapters: Chapter[] = [];
  let current = { title: "Beginning", body: [] as string[] };
  const push = () => current.body.length && chapters.push({ title: current.title, xhtml: current.body.join(""), toc: true });
  for (const raw of blocks) {
    const block = raw.replace(/\s*\n\s*/g, " ").trim();
    if (!block) continue;
    if (heading.test(block) && block.length < 70) {
      push();
      current = { title: block, body: [`<h2>${escapeText(block)}</h2>`] };
    } else current.body.push(`<p>${escapeText(block)}</p>`);
    // Long texts without headings still break into readable pieces.
    if (current.body.length > 400) {
      push();
      current = { title: `${current.title}, continued`, body: [] };
    }
  }
  push();
  return chapters;
}

/** A small Markdown reader. Headings, emphasis, links, lists, quotes and code. */
export function markdownToHtml(md: string) {
  const inline = (s: string) =>
    escapeText(s)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2"/>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<em>$2</em>")
      .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const out: string[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (listType) out.push(`</${listType}>`);
    listType = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      closeList();
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${escapeText(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      closeList();
      out.push("<hr/>");
      continue;
    }
    const li = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush();
      const type = /\d/.test(li[1]) ? "ol" : "ul";
      if (listType !== type) {
        closeList();
        out.push(`<${type}>`);
        listType = type;
      }
      out.push(`<li>${inline(li[2])}</li>`);
      continue;
    }
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      flush();
      closeList();
      out.push(`<blockquote><p>${inline(q[1])}</p></blockquote>`);
      continue;
    }
    if (!line.trim()) {
      flush();
      closeList();
      continue;
    }
    para.push(line.trim());
  }
  flush();
  closeList();
  return out.join("\n");
}

/** HTML split at its top headings into chapters. */
async function htmlToChapters(html: string, content: Content, fallback: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  cleanBody(doc);
  await takeImages(doc, content.images);
  const level = doc.body.querySelector("h1") ? "H1" : doc.body.querySelectorAll("h2").length > 1 ? "H2" : null;
  const chapters: Chapter[] = [];
  let holder = doc.createElement("div");
  const push = () => {
    if (!holder.childNodes.length) return;
    chapters.push({ title: titleOf(holder, chapters.length ? `Part ${chapters.length + 1}` : fallback), xhtml: bodyToXhtml(holder), toc: true });
    holder = doc.createElement("div");
  };
  for (const node of Array.from(doc.body.childNodes)) {
    if (level && node instanceof Element && node.tagName === level) push();
    holder.appendChild(node);
  }
  push();
  return chapters;
}

/**
 * Reads any book Shelfed understands into Content. Foliate's own section
 * loader handles e-books, so MOBI, AZW3, FB2 and comics come out the way
 * an EPUB does, pictures and all.
 */
export async function extractContent(book: Book, ext: string, onProgress?: (share: number) => void): Promise<Content> {
  const content: Content = {
    title: book.title,
    authors: book.authors,
    language: book.language ?? "en",
    description: book.description,
    publisher: book.publisher,
    published: book.published,
    isbn: book.isbn,
    chapters: [],
    images: new Map(),
    css: "",
  };
  if (book.cover) {
    try {
      const data = new Uint8Array(await (await fetch(`shelf://cover/${book.id}?v=${book.cover}`)).arrayBuffer());
      content.cover = { data, type: sniff(data) };
    } catch {
      // No cover is fine.
    }
  }
  const file = await fetchFile(book, ext);

  if (FOLIATE.includes(ext)) {
    const fb = await openFoliate(file);
    const tocTitles = new Map<number, string>();
    for (const item of fb.toc ?? []) {
      try {
        const [index] = fb.splitTOCHref?.(item.href) ?? [];
        const i = typeof index === "number" ? index : fb.sections.findIndex((s) => s.id === index);
        if (i >= 0 && !tocTitles.has(i)) tocTitles.set(i, item.label.trim());
      } catch {
        // A broken contents entry only loses its title.
      }
    }
    const css = new Set<string>();
    const unlink = (sheet: string) => sheet.replace(/url\((['"]?)blob:[^)]+\1\)/g, "none");
    for (let i = 0; i < fb.sections.length; i++) {
      const section = fb.sections[i];
      onProgress?.(i / fb.sections.length);
      try {
        const text = await (await fetch(await section.load())).text();
        let doc = new DOMParser().parseFromString(text, "application/xhtml+xml");
        if (doc.querySelector("parsererror")) doc = new DOMParser().parseFromString(text, "text/html");
        // The book's own styles stay, minus anything that points at files.
        for (const link of Array.from(doc.querySelectorAll('link[rel~="stylesheet"]'))) {
          const href = link.getAttribute("href");
          if (href?.startsWith("blob:")) {
            const sheet = await (await fetch(href)).text().catch(() => "");
            css.add(unlink(sheet.replace(/@import[^;]+;/g, "").replace(/@font-face\s*{[^}]*}/g, "")));
          }
        }
        doc.querySelectorAll("style").forEach((s) => css.add(unlink(s.textContent ?? "")));
        cleanBody(doc);
        await takeImages(doc, content.images);
        const body = doc.body ?? doc.querySelector("body");
        if (!body || (!body.textContent?.trim() && !body.querySelector("img, svg, image"))) continue;
        const toc = tocTitles.get(i);
        content.chapters.push({ title: toc ?? titleOf(body, `Section ${i + 1}`), xhtml: bodyToXhtml(body), toc: Boolean(toc || body.querySelector("h1, h2")) });
      } catch {
        // One unreadable section should not sink the whole book.
      } finally {
        section.unload?.();
      }
    }
    fb.destroy?.();
    content.css = [...css].join("\n").slice(0, 200_000);
    if (ext === "cbz") content.css += "\nimg { display: block; margin: 0 auto; max-height: 100vh; }";
    return content;
  }

  if (ext === "pdf") {
    const { openPdf, pageParagraphs, closePdf } = await pdf();
    const doc = await openPdf(await file.arrayBuffer());
    const per = 12;
    for (let start = 1; start <= doc.numPages; start += per) {
      const end = Math.min(doc.numPages, start + per - 1);
      const paragraphs: string[] = [];
      for (let n = start; n <= end; n++) {
        onProgress?.(n / doc.numPages);
        paragraphs.push(...(await pageParagraphs(doc, n)));
      }
      const xhtml = paragraphs.map((p) => `<p>${escapeText(p)}</p>`).join("");
      if (xhtml) content.chapters.push({ title: doc.numPages > per ? `Pages ${start} to ${end}` : content.title, xhtml, toc: true });
    }
    closePdf(doc);
    return content;
  }

  if (ext === "txt") {
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    // Lots of broken characters means an older single byte encoding.
    if ((text.match(/�/g)?.length ?? 0) > 20) text = new TextDecoder("windows-1250").decode(buffer);
    content.chapters = textToChapters(text);
    return content;
  }
  if (ext === "md") {
    content.chapters = await htmlToChapters(markdownToHtml(await file.text()), content, book.title);
    return content;
  }
  if (ext === "html" || ext === "xhtml") {
    content.chapters = await htmlToChapters(await file.text(), content, book.title);
    return content;
  }
  if (ext === "docx") {
    content.chapters = await htmlToChapters(await api.docxHtml(book.id), content, book.title);
    return content;
  }
  throw new Error(`Shelfed cannot read ${ext.toUpperCase()} files on its own.`);
}
