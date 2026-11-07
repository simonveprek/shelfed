import { app, net } from "electron";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import type { Catalogue, CatalogueBook, CataloguePage } from "../shared/types";
import { t } from "../shared/i18n";
import { safeName } from "./library";
import { getSettings, setSettings } from "./settings";
import { kid, kids, parseXml, textOf, type XmlNode } from "./xml";

/*
 * Catalogues you add yourself: any OPDS feed, such as a Calibre content
 * server's, a library's, or a shop's free shelf. OPDS 1 is Atom, read by
 * Shelfed's own small XML reader; OPDS 2 is JSON.
 *
 * Shelfed only ever goes where a catalogue sends it. The page asks for a
 * catalogue by the address you gave it, and after that only for the places,
 * covers and books that catalogue linked to, so nothing the page says can
 * make it fetch anything else.
 */

const UA = { "User-Agent": "Shelfed/1.0 (open source book library)" };
const MOST_FEED = 8_000_000;
const MOST_IMAGE = 4_000_000;
const MOST_BOOK = 400_000_000;

/** File types a catalogue offers, as the extension Shelfed knows them by. */
const TYPES: Record<string, string> = {
  "application/epub+zip": "epub",
  "application/kepub+zip": "epub",
  "application/x-mobi8-ebook": "azw3",
  "application/vnd.amazon.mobi8-ebook": "azw3",
  "application/x-mobipocket-ebook": "mobi",
  "application/fb2+zip": "fbz",
  "application/x-fictionbook+xml": "fb2",
  "text/fb2+xml": "fb2",
  "application/pdf": "pdf",
  "application/x-cbz": "cbz",
  "application/vnd.comicbook+zip": "cbz",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/html": "html",
};

/** The order Shelfed would rather have a book in. */
const BEST = ["epub", "azw3", "mobi", "fb2", "fbz", "docx", "cbz", "pdf", "txt"];

/** A book you'd have to pay for, borrow, or open with Adobe's or Readium's lock. */
const LOCKED_TYPES = /adobe\.adept|readium\.lcp|vnd\.adobe/i;
const NOT_FREE = /\/acquisition\/(buy|borrow|subscribe|sample|preview)$/;

const typeOf = (type = "") => type.split(";")[0].trim().toLowerCase();
const extOf = (type = "") => TYPES[typeOf(type)];

/* ------------------------------------------------------------------------ */
/* Where Shelfed may go                                                      */
/* ------------------------------------------------------------------------ */

/** Every address a catalogue has linked to, by what it is, so only those are ever fetched. */
const known = new Map<string, "page" | "image" | "book" | "search">();
const MOST_KNOWN = 50_000;

function know(url: string, kind: "page" | "image" | "book" | "search") {
  if (known.size >= MOST_KNOWN && !known.has(url)) known.delete(known.keys().next().value!);
  known.set(url, kind);
}

/** An address as an absolute http(s) one, against the page it was on; anything else is nothing. */
export function absolute(href: string | undefined, base: string) {
  if (!href) return undefined;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A link that may hold a template's {parts}, as an absolute address with the parts kept as they are. */
export function absoluteTemplate(href: string | undefined, base: string) {
  if (!href) return undefined;
  const parts: string[] = [];
  const marked = href.replace(/\{[^{}]*\}/g, (part) => `SHELFEDPART${parts.push(part) - 1}X`);
  return absolute(marked, base)?.replace(/SHELFEDPART(\d+)X/g, (_, i: string) => parts[Number(i)]);
}

/** Whether a catalogue's address may be fetched: one you added, or one a catalogue linked to. */
function allowed(url: string, kind: "page" | "image" | "book" | "search") {
  if (kind === "page" && (getSettings().catalogues ?? []).some((c) => c.url === url)) return true;
  return known.get(url) === kind;
}

/* ------------------------------------------------------------------------ */
/* Fetching, with limits                                                     */
/* ------------------------------------------------------------------------ */

/** For the app tests: a folder of feeds stands in for the web, with no network at all. Never in an installed app. */
const standIn = () => (!app.isPackaged && process.env.SHELF_OPDS_DIR ? resolve(process.env.SHELF_OPDS_DIR) : null);

async function fromStandIn(folder: string, url: string) {
  // https://catalogue.test/opds/new → <folder>/catalogue.test/opds/new, with its query in the name.
  const { host, pathname, search } = new URL(url);
  const path = resolve(folder, host, `.${decodeURIComponent(pathname)}${search ? encodeURIComponent(search) : ""}`.replace(/\/$/, "/index"));
  const inside = relative(folder, path);
  if (!inside || inside.startsWith("..")) throw new Error("Outside the stand-in");
  try {
    const bytes = await readFile(path);
    const type = path.endsWith(".json") ? "application/opds+json" : path.endsWith(".epub") ? "application/epub+zip" : path.endsWith(".png") ? "image/png" : "application/atom+xml";
    return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": type } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function get(url: string, timeout: number) {
  const folder = standIn();
  if (folder) return fromStandIn(folder, url);
  return net.fetch(url, { headers: { ...UA, Accept: "application/atom+xml, application/opds+json, application/json;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(timeout) });
}

/** An answer's body, read as it comes, never longer than most. */
async function body(res: Response, most: number) {
  if (Number(res.headers.get("content-length") ?? 0) > most) throw new Error(t("That's far bigger than a catalogue sends."));
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader?.read(); part && !part.done; part = await reader!.read()) {
    size += part.value.byteLength;
    if (size > most) {
      await reader!.cancel();
      throw new Error(t("That's far bigger than a catalogue sends."));
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}

/** Why a catalogue didn't answer, in plain words. */
function failure(res: Response, url: string) {
  const host = new URL(url).host;
  if (res.status === 401 || res.status === 403) return new Error(t("{host} wants a password, and Shelfed can't sign in to catalogues yet.", { host }));
  if (res.status === 404) return new Error(t("{host} has nothing at that address.", { host }));
  return new Error(t("{host} answered {status}", { host, status: String(res.status) }));
}

async function fetchText(url: string) {
  let res: Response;
  try {
    res = await get(url, 20_000);
  } catch {
    throw new Error(t("Shelfed couldn't reach {host}. Check the address, and that you're online.", { host: new URL(url).host }));
  }
  if (!res.ok) throw failure(res, url);
  return { text: (await body(res, MOST_FEED)).toString("utf8"), type: typeOf(res.headers.get("content-type") ?? ""), url: res.url || url };
}

/* ------------------------------------------------------------------------ */
/* Reading OPDS 1, Atom                                                      */
/* ------------------------------------------------------------------------ */

const clip = (text: string, most: number) => (text.length > most ? `${text.slice(0, most - 1).trimEnd()}…` : text);
const BLOCKS = new Set(["p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6"]);

/** An element's words, with paragraphs kept apart. */
function words(node: XmlNode | undefined): string {
  if (!node) return "";
  const walk = (n: XmlNode): string => (n.name === "#text" ? n.text : `${BLOCKS.has(n.name) ? "\n" : ""}${n.children.map(walk).join("")}${BLOCKS.has(n.name) ? "\n" : ""}`);
  return walk(node)
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Text that a feed marked as HTML, as plain words. */
const fromHtml = (html: string) => {
  const node = parseXml(`<x>${html}</x>`);
  return node ? words(node) : html.replace(/<[^>]*>/g, " ");
};

function entryText(node: XmlNode | undefined) {
  if (!node) return "";
  const type = node.attrs.type ?? "text";
  return type === "html" ? fromHtml(textOf(node)) : words(node);
}

type Link = { href: string; rel: string; type: string; title: string; size?: number };

/** A small picture written into the feed itself, kept as it is. */
const inlineImage = (href = "") => /^data:image\/(png|jpe?g|gif|webp);/i.test(href) && href.length < 300_000;

function links(node: XmlNode, base: string): Link[] {
  return kids(node, "link").flatMap((l) => {
    const href = inlineImage(l.attrs.href) ? l.attrs.href : absolute(l.attrs.href, base);
    return href ? [{ href, rel: (l.attrs.rel ?? "").trim(), type: l.attrs.type ?? "", title: l.attrs.title ?? "", size: Number(l.attrs.length) || undefined }] : [];
  });
}

const isFeed = (type: string) => /atom\+xml|opds\+json|opds-catalog/i.test(type);
const isImage = (l: Link) => /opds-spec\.org\/(image|thumbnail)|x-stanza-cover-image/.test(l.rel);

/** The best file of a book, and whether every one there is is locked or for sale. */
function acquire(found: Array<{ href: string; rel: string; type: string; size?: number }>) {
  const acquisitions = found.filter((l) => /opds-spec\.org\/acquisition/.test(l.rel) && !l.href.startsWith("data:"));
  const open = acquisitions.filter((l) => !NOT_FREE.test(l.rel) && !LOCKED_TYPES.test(l.type));
  const files = open.map((l) => ({ url: l.href, ext: extOf(l.type) ?? extFromUrl(l.href), size: l.size })).filter((f): f is { url: string; ext: string; size: number | undefined } => Boolean(f.ext));
  // The kind Shelfed reads best, and of those the fullest, since an edition without its pictures is smaller.
  const file = files.sort((a, b) => BEST.indexOf(a.ext) - BEST.indexOf(b.ext) || (b.size ?? 0) - (a.size ?? 0))[0];
  return { file, offered: acquisitions.length > 0, locked: acquisitions.length > 0 && !file };
}

const extFromUrl = (url: string) => {
  const ext = new URL(url).pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return ext && BEST.includes(ext) ? ext : ext === "kepub" ? "epub" : undefined;
};

function bookFrom(id: string, title: string, authors: string[], summary: string, all: Link[], extra: Partial<CatalogueBook> = {}): CatalogueBook | null {
  const { file, offered, locked } = acquire(all);
  if (!offered) return null;
  const images = all.filter(isImage);
  const thumb = images.find((l) => /thumbnail/.test(l.rel)) ?? images[0];
  const cover = images.find((l) => !/thumbnail/.test(l.rel)) ?? thumb;
  for (const image of [thumb, cover]) if (image && !inlineImage(image.href)) know(image.href, "image");
  if (file) know(file.url, "book");
  return {
    id: clip(id || file?.url || title, 500),
    title: clip(title || t("Untitled"), 300),
    authors: authors.map((a) => clip(a, 120)).filter(Boolean).slice(0, 8),
    summary: summary ? clip(summary, 2000) : undefined,
    cover: thumb?.href,
    bigCover: cover?.href,
    file,
    locked: locked || undefined,
    ...extra,
  };
}

/** A page of an OPDS 1 catalogue: its title, where it leads, its books, and what comes next. */
export function readAtom(xml: string, url: string): CataloguePage {
  const feed = parseXml(xml);
  if (!feed || feed.name !== "feed") throw new Error(t("That isn't a catalogue Shelfed can read. Look for an address that ends in /opds."));
  const base = absolute(feed.attrs["xml:base"], url) ?? url;
  const own = links(feed, base);
  const page: CataloguePage = { title: clip(words(kid(feed, "title")), 200), url, places: [], books: [] };
  for (const entry of kids(feed, "entry")) {
    const at = absolute(entry.attrs["xml:base"], base) ?? base;
    const all = links(entry, at);
    const title = words(kid(entry, "title"));
    const authors = kids(entry, "author").map((a) => words(kid(a, "name")));
    const summary = entryText(kid(entry, "summary")) || entryText(kid(entry, "content"));
    const book = bookFrom(words(kid(entry, "id")), title, authors, summary, all, {
      language: words(kid(entry, "language")) || undefined,
      published: (words(kid(entry, "issued")) || words(kid(entry, "published"))).slice(0, 10) || undefined,
    });
    if (book) {
      page.books.push(book);
      continue;
    }
    // An entry that leads to another page of the catalogue is a place to go.
    const to = all.find((l) => isFeed(l.type) && l.rel !== "self" && !/related|alternate/.test(l.rel));
    if (to) {
      know(to.href, "page");
      page.places.push({ title: clip(title || to.title || t("Untitled"), 200), url: to.href, summary: summary ? clip(summary.split("\n")[0], 200) : undefined });
    }
  }
  const next = own.find((l) => l.rel === "next");
  if (next) know((page.next = next.href), "page");
  // A template to fill in is quicker than an OpenSearch description to read first.
  const searches = kids(feed, "link").filter((l) => l.attrs.rel === "search");
  const search = searches.find((l) => /atom/.test(l.attrs.type ?? "") && l.attrs.href?.includes("{")) ?? searches[0];
  const template = absoluteTemplate(search?.attrs.href, base);
  if (template) know((page.search = template), "search");
  return page;
}

/* ------------------------------------------------------------------------ */
/* Reading OPDS 2, JSON                                                      */
/* ------------------------------------------------------------------------ */

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => Boolean(x) && typeof x === "object") : v && typeof v === "object" ? [v as Json] : []);
const names = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(names) : v && typeof v === "object" ? [str((v as Json).name)] : []);

function linksIn(v: unknown, base: string): Array<Link & { size?: number }> {
  return list(v).flatMap((l) => {
    const href = absolute(str(l.href), base);
    const rel = Array.isArray(l.rel) ? l.rel.map(str).join(" ") : str(l.rel);
    const size = Number((l.properties as Json | undefined)?.size ?? 0) || undefined;
    return href ? [{ href, rel, type: str(l.type), title: str(l.title), size }] : [];
  });
}

/** A page of an OPDS 2 catalogue. */
export function readJson(text: string, url: string): CataloguePage {
  let doc: Json;
  try {
    doc = JSON.parse(text) as Json;
  } catch {
    throw new Error(t("That isn't a catalogue Shelfed can read. Look for an address that ends in /opds."));
  }
  if (!doc || typeof doc !== "object" || !doc.metadata) throw new Error(t("That isn't a catalogue Shelfed can read. Look for an address that ends in /opds."));
  const page: CataloguePage = { title: clip(str((doc.metadata as Json).title), 200), url, places: [], books: [] };
  const sections = [doc, ...list(doc.groups)];
  for (const section of sections) {
    // A group leads to the whole of itself.
    const whole = section !== doc && linksIn(section.links, url).find((l) => l.rel.split(" ").includes("self"));
    const named = str(((section.metadata ?? {}) as Json).title);
    if (whole && named && whole.href !== url) {
      know(whole.href, "page");
      page.places.push({ title: clip(named, 200), url: whole.href });
    }
    for (const nav of linksIn(section.navigation, url)) {
      know(nav.href, "page");
      page.places.push({ title: clip(nav.title || t("Untitled"), 200), url: nav.href });
    }
    for (const publication of list(section.publications)) {
      const meta = (publication.metadata ?? {}) as Json;
      // The smallest picture is the thumbnail, the rest the cover.
      const widths = list(publication.images).map((i) => Number(i.width) || 0);
      const images = linksIn(publication.images, url)
        .map((l, i) => ({ ...l, width: widths[i] ?? 0 }))
        .sort((a, b) => a.width - b.width)
        .map((l, i, all) => ({ ...l, rel: i === 0 && all.length > 1 ? "http://opds-spec.org/image/thumbnail" : "http://opds-spec.org/image" }));
      const book = bookFrom(str(meta.identifier), str(meta.title), names(meta.author), fromHtml(str(meta.description)), [...linksIn(publication.links, url), ...images], {
        language: names(meta.language)[0] || undefined,
        published: str(meta.published).slice(0, 10) || undefined,
      });
      if (book) page.books.push(book);
    }
  }
  const own = linksIn(doc.links, url);
  const next = own.find((l) => l.rel.split(" ").includes("next"));
  if (next) know((page.next = next.href), "page");
  const search = list(doc.links).find((l) => str(l.rel) === "search" || (Array.isArray(l.rel) && l.rel.includes("search")));
  const template = absoluteTemplate(str(search?.href), url);
  if (template) know((page.search = template), "search");
  return page;
}

/* ------------------------------------------------------------------------ */
/* What the page asks for                                                    */
/* ------------------------------------------------------------------------ */

async function readPage(url: string): Promise<CataloguePage> {
  const { text, type, url: landed } = await fetchText(url);
  const page = type.includes("json") || /^\s*\{/.test(text) ? readJson(text, landed) : readAtom(text, landed);
  page.url = url;
  return page;
}

/** A page of a catalogue: one you added, or one it linked to. */
export async function cataloguePage(url: string): Promise<CataloguePage> {
  if (typeof url !== "string" || !allowed(url, "page")) throw new Error(t("Shelfed only follows a catalogue's own links."));
  return readPage(url);
}

/** A search template filled in: {searchTerms} and OPDS 2's {query}, with optional parts left out. */
export function fillTemplate(template: string, query: string) {
  const q = encodeURIComponent(query.trim());
  return template
    .replace(/\{\?query\}/g, `?query=${q}`)
    .replace(/\{(searchTerms|query)\}/g, q)
    .replace(/\{[^}]*\?\}/g, "")
    .replace(/\{[^}]*\}/g, "");
}

/** The address to search a catalogue at, from its search link: a template, or an OpenSearch description of one. */
async function searchTemplate(link: string) {
  if (link.includes("{")) return link;
  const { text } = await fetchText(link);
  const doc = parseXml(text);
  const urls = kids(doc ?? undefined, "url").map((u) => ({ type: u.attrs.type ?? "", template: u.attrs.template ?? "" }));
  const best = urls.find((u) => /opds|atom/.test(u.type)) ?? urls.find((u) => !/html|suggestions/.test(u.type));
  return absoluteTemplate(best?.template, link);
}

/** What a catalogue finds for some words. */
export async function searchCatalogue(link: string, query: string): Promise<CataloguePage> {
  if (typeof link !== "string" || !allowed(link, "search")) throw new Error(t("Shelfed only follows a catalogue's own links."));
  if (typeof query !== "string" || !query.trim()) throw new Error(t("Type something to look for."));
  const template = await searchTemplate(link);
  const url = template && absolute(fillTemplate(template, query.slice(0, 200)), link);
  if (!url) throw new Error(t("This catalogue can't be searched."));
  know(url, "page");
  return readPage(url);
}

/** A cover from a catalogue, for the page to show, from an address the catalogue gave. */
export async function catalogueImage(url: string | null): Promise<Response> {
  if (!url || !allowed(url, "image")) return new Response("Not found", { status: 404 });
  try {
    const res = await get(url, 20_000);
    const type = typeOf(res.headers.get("content-type") ?? "");
    if (!res.ok || !type.startsWith("image/") || type.includes("svg")) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(await body(res, MOST_IMAGE)), { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

/** Downloads a book a catalogue gave to a temporary file, ready to add like any other. */
export async function downloadFromCatalogue(url: string, title: string, ext: string) {
  if (typeof url !== "string" || !allowed(url, "book")) throw new Error(t("Shelfed only follows a catalogue's own links."));
  let res: Response;
  try {
    res = await get(url, 600_000);
  } catch {
    throw new Error(t("Shelfed couldn't reach {host}. Check the address, and that you're online.", { host: new URL(url).host }));
  }
  if (!res.ok) throw failure(res, url);
  // What it turned out to be beats what the link said, when the server knows.
  const named = res.headers.get("content-disposition")?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1];
  const kind = extOf(res.headers.get("content-type") ?? "") ?? (named && extFromUrl(`https://x/${named}`)) ?? (BEST.includes(ext) ? ext : undefined);
  if (!kind) throw new Error(t("Shelfed can't tell what kind of file this is."));
  const bytes = await body(res, MOST_BOOK);
  const dir = await mkdtemp(join(tmpdir(), "shelf-"));
  const path = join(dir, `${safeName(String(title || "Book"), 90)}.${kind}`);
  await writeFile(path, bytes);
  return path;
}

/* ------------------------------------------------------------------------ */
/* The catalogues you added                                                  */
/* ------------------------------------------------------------------------ */

/** Adds a catalogue by its address, once it's answered as one. */
export async function addCatalogue(address: string): Promise<Catalogue[]> {
  let typed = String(address ?? "").trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(typed)) typed = `http://${typed}`;
  const url = absolute(typed, "http://localhost/");
  if (!url || typed.length > 2000) throw new Error(t("That isn't a web address."));
  if (new URL(url).username || new URL(url).password) throw new Error(t("Leave the name and password out of the address. Shelfed can't sign in to catalogues yet."));
  const have = getSettings().catalogues ?? [];
  if (have.some((c) => c.url === url)) throw new Error(t("That catalogue is here already."));
  const page = await readPage(url);
  const name = page.title || new URL(url).host;
  const catalogue: Catalogue = { id: Math.random().toString(36).slice(2, 10), name: clip(name, 80), url };
  return setSettings({ catalogues: [...have, catalogue] }).catalogues ?? [];
}

export function removeCatalogue(id: string): Catalogue[] {
  return setSettings({ catalogues: (getSettings().catalogues ?? []).filter((c) => c.id !== id) }).catalogues ?? [];
}
