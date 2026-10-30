import { app, net } from "electron";
import { copyFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { FreeBook } from "../shared/types";
import { t } from "../shared/i18n";
import { safeName } from "./library";

/*
 * Free books, from two places that take care of them. Standard Ebooks
 * makes careful editions of public domain books. Project Gutenberg keeps
 * the largest collection. Both answer in Atom feeds, read here by hand so
 * nothing else is needed.
 */

const UA = { "User-Agent": "Shelfed/1.0 (open source book library)" };

async function text(url: string) {
  const res = await net.fetch(url, { headers: UA });
  if (!res.ok) throw new Error(t("{host} answered {status}", { host: new URL(url).host, status: String(res.status) }));
  return res.text();
}

const entries = (xml: string) => xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) ?? [];
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.trim();
const attr = (el: string, name: string) => el.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const decode = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

async function standard(query: string): Promise<FreeBook[]> {
  const url = query.trim()
    ? `https://standardebooks.org/feeds/atom/all?query=${encodeURIComponent(query.trim())}`
    : "https://standardebooks.org/feeds/atom/new-releases";
  return entries(await text(url)).flatMap((e) => {
    const links = e.match(/<link [^>]*>/g) ?? [];
    const epub = links.find((l) => attr(l, "rel") === "enclosure" && attr(l, "type") === "application/epub+zip" && !/advanced|kepub/.test(attr(l, "href") ?? ""));
    const page = links.find((l) => attr(l, "rel") === "alternate");
    if (!epub) return [];
    return [{
      id: `se:${tag(e, "id")}`,
      source: "standard" as const,
      title: decode(tag(e, "title")),
      author: decode(tag(tag(e, "author") ?? "", "name")),
      cover: attr(e.match(/<media:thumbnail [^>]*>/)?.[0] ?? "", "url"),
      epub: decode(attr(epub, "href")),
      page: decode(attr(page ?? "", "href")),
      summary: decode(tag(e, "summary")),
    }];
  });
}

async function gutenberg(query: string): Promise<FreeBook[]> {
  const url = query.trim()
    ? `https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(query.trim())}`
    : "https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads";
  return entries(await text(url)).flatMap((e) => {
    // Book entries point at their own page, numbered. The rest lead to lists.
    const n = tag(e, "id")?.match(/\/ebooks\/(\d+)\.opds$/)?.[1];
    if (!n) return [];
    return [{
      id: `pg:${n}`,
      source: "gutenberg" as const,
      title: decode(tag(e, "title")),
      author: decode(tag(e, "content")),
      cover: `https://www.gutenberg.org/cache/epub/${n}/pg${n}.cover.medium.jpg`,
      epub: `https://www.gutenberg.org/ebooks/${n}.epub3.images`,
      page: `https://www.gutenberg.org/ebooks/${n}`,
    }];
  });
}

/**
 * For the app tests: a folder of "Title - Author.epub" files stands in for
 * Standard Ebooks, so no test needs the internet. Never in an installed app.
 */
const standIn = () => (!app.isPackaged && process.env.SHELF_FREE_DIR ? resolve(process.env.SHELF_FREE_DIR) : null);

async function fromStandIn(folder: string, query: string): Promise<FreeBook[]> {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return (await readdir(folder))
    .filter((name) => name.endsWith(".epub") && words.every((w) => name.toLowerCase().includes(w)))
    .map((name) => {
      const [title, author = ""] = name.replace(/\.epub$/, "").split(" - ");
      return { id: `test:${name}`, source: "standard" as const, title, author, epub: `file://${join(folder, name)}`, page: "", summary: `What ${title} is about.` };
    });
}

export const freeBooks = (source: "standard" | "gutenberg", query: string) => {
  const folder = standIn();
  if (folder) return fromStandIn(folder, query);
  return source === "standard" ? standard(query) : gutenberg(query);
};

/** The summary in a Gutenberg book's own feed, as it's written there. */
export function summaryIn(feed: string) {
  const found = feed.match(/<p>\s*Summary:\s*([\s\S]*?)<\/p>/)?.[1];
  return found ? decode(found.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() : null;
}

/** What a Gutenberg book is about. Its search results don't say, so this asks for the one book. */
export async function freeSummary(id: string) {
  const n = id.match(/^pg:(\d+)$/)?.[1];
  return n ? summaryIn(await text(`https://www.gutenberg.org/ebooks/${n}.opds`)) : null;
}

/** Fetches a free book to a temporary file, ready to be added like any other. */
export async function downloadBook(url: string, name: string) {
  const folder = standIn();
  if (folder && url.startsWith("file://") && dirname(resolve(url.slice(7))) === folder) {
    const dir = await mkdtemp(join(tmpdir(), "shelf-"));
    const path = join(dir, `${safeName(name, 90)}.epub`);
    await copyFile(url.slice(7), path);
    return path;
  }
  if (!/^https:\/\/(standardebooks\.org|www\.gutenberg\.org)\//.test(url)) throw new Error(t("Shelfed only downloads from Standard Ebooks and Project Gutenberg."));
  const res = await net.fetch(url, { headers: UA });
  if (!res.ok) throw new Error(t("The download stopped with {status}", { status: String(res.status) }));
  const dir = await mkdtemp(join(tmpdir(), "shelf-"));
  const path = join(dir, `${safeName(name, 90)}.epub`);
  await writeFile(path, new Uint8Array(await res.arrayBuffer()));
  return path;
}

/** Removes a downloaded book's temporary folder once it has been added. */
export async function forgetDownload(path: string) {
  const dir = dirname(path);
  // Only ever a folder this file made for a download.
  if (dirname(dir) !== tmpdir() || !basename(dir).startsWith("shelf-")) return;
  await rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
