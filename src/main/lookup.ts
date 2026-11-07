import { app, net } from "electron";
import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Lookup, Sense } from "../shared/types";
import { t } from "../shared/i18n";

/*
 * Looking up a word while reading. Wiktionary says what a word means, in
 * English, for words of every language, and leads a word as it's written
 * ("knihou") back to the one it comes from ("kniha"). Wikipedia, in the book's
 * own language, says who or what a name is. Only the word goes out, and only
 * when it's asked about.
 */

const UA = { "User-Agent": "Shelfed/1.0 (open source book library; https://shelfed.simonveprek.cz)" };
const LARGEST = 2_000_000;

/** What was selected, as something to look up: a word or a short phrase without the punctuation around it. */
export function wordOf(selection: string) {
  const word = selection
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!/\p{L}/u.test(word) || word.length > 64 || word.split(" ").length > 4) return null;
  return word;
}

/** The language part of a tag like "cs-CZ", if it is one. */
export const languageOf = (tag?: string) => tag?.trim().match(/^([a-z]{2,3})(?:[-_][a-z0-9-]*)?$/i)?.[1].toLowerCase() ?? null;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Wiktionary's HTML as plain words. */
export function plain(html: string) {
  return html
    .replace(/<(style|script|sup)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
      if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? all;
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    })
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .trim();
}

/** The word a definition says this one is a form of ("instrumental singular of kniha"), if it says so. */
export function lemmaIn(html: string) {
  if (!/class="[^"]*\bform-of-definition\b/.test(html)) return null;
  const title = html.match(/class="[^"]*\bform-of-definition-link\b[^"]*"[\s\S]*?title="([^"]+)"/)?.[1];
  return title ? plain(title) || null : null;
}

type Entry = { partOfSpeech?: unknown; language?: unknown; definitions?: unknown };

/**
 * What Wiktionary's answer says, the book's language first: at most three
 * kinds of word, three meanings each. Also the word it's a form of, when
 * every meaning in the first one is just that.
 */
export function sensesIn(answer: unknown, lang: string): { senses: Sense[]; lemma: string | null } {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return { senses: [], lemma: null };
  const codes = Object.keys(answer).filter((code) => /^[a-z]{2,3}(-[a-z]+)?$/i.test(code));
  const order = [...codes.filter((c) => c === lang), ...codes.filter((c) => c !== lang)];
  const senses: Sense[] = [];
  let lemma: string | null = null;
  for (const code of order) {
    const entries = (answer as Record<string, unknown>)[code];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries as Entry[]) {
      if (senses.length >= 3) break;
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.definitions)) continue;
      const htmls = entry.definitions.map((d: unknown) => (d && typeof d === "object" && typeof (d as { definition?: unknown }).definition === "string" ? (d as { definition: string }).definition : "")).filter(Boolean);
      const meanings = htmls.map(plain).filter((m) => m.length > 1).slice(0, 3);
      if (!meanings.length) continue;
      if (!senses.length) {
        const lemmas = htmls.map(lemmaIn);
        if (lemmas.length && lemmas.every((l) => l && l === lemmas[0])) lemma = lemmas[0];
      }
      senses.push({
        part: typeof entry.partOfSpeech === "string" ? entry.partOfSpeech.slice(0, 40) : "",
        language: typeof entry.language === "string" ? entry.language.slice(0, 40) : code,
        code,
        meanings: meanings.map((m) => (m.length > 400 ? `${m.slice(0, 399)}…` : m)),
      });
    }
    // The book's own language is enough when it has an answer.
    if (code === lang && senses.length) break;
  }
  return { senses, lemma };
}

/** The opening of a Wikipedia article, if the answer is one and not a list of meanings. */
export function summaryOf(answer: unknown, lang: string): Lookup["wiki"] {
  if (!answer || typeof answer !== "object") return undefined;
  const a = answer as { type?: unknown; title?: unknown; extract?: unknown; content_urls?: { desktop?: { page?: unknown } } };
  if (a.type !== "standard" || typeof a.title !== "string" || typeof a.extract !== "string" || !a.extract.trim()) return undefined;
  let extract = a.extract.replace(/\s+/g, " ").trim();
  if (extract.length > 600) {
    const cut = extract.slice(0, 600);
    const end = cut.lastIndexOf(". ");
    extract = end > 200 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
  }
  const page = a.content_urls?.desktop?.page;
  const url = typeof page === "string" && new RegExp(`^https://${lang}\\.wikipedia\\.org/`).test(page) ? page : wikiPage(lang, a.title);
  return { title: a.title.slice(0, 120), extract, url };
}

const title = (word: string) => encodeURIComponent(word.replace(/ /g, "_"));
const wikiPage = (lang: string, word: string) => `https://${lang}.wikipedia.org/wiki/${title(word)}`;

/**
 * For the app tests: a folder of answers stands in for Wiktionary and
 * Wikipedia, so no test needs the internet. Never in an installed app.
 */
const standIn = () => (!app.isPackaged && process.env.SHELF_LOOKUP_DIR ? resolve(process.env.SHELF_LOOKUP_DIR) : null);

async function fromStandIn(folder: string, ...parts: string[]) {
  const path = resolve(folder, ...parts.map((p) => encodeURIComponent(p)));
  const inside = relative(folder, path);
  if (!inside || inside.startsWith("..")) return null;
  // No file is no such page; a broken one stands for not being able to ask.
  const text = await readFile(`${path}.json`, "utf8").catch((error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? null : Promise.reject(error)));
  return text === null ? null : (JSON.parse(text) as unknown);
}

/** JSON from the address, nothing when there's no such page, and an error when it can't be reached. */
async function json(url: string): Promise<unknown> {
  const res = await net.fetch(url, { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > LARGEST) throw new Error("Too long an answer");
  // Read as it comes, and stop once it's longer than any real answer.
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let part = await reader?.read(); part && !part.done; part = await reader!.read()) {
    size += part.value.byteLength;
    if (size > LARGEST) {
      await reader!.cancel();
      throw new Error("Too long an answer");
    }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const wiktionary = (word: string) => {
  const folder = standIn();
  return folder ? fromStandIn(folder, "wiktionary", word) : json(`https://en.wiktionary.org/api/rest_v1/page/definition/${title(word)}`);
};

const wikipedia = (word: string, lang: string) => {
  const folder = standIn();
  return folder ? fromStandIn(folder, "wikipedia", lang, word) : json(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title(word)}`);
};

const asked = new Map<string, Lookup>();

/**
 * What a word means, or who or what a name is. Nothing found is an answer
 * with nothing in it; not being able to ask anyone is an error.
 */
export async function lookUp(selection: string, bookLanguage?: string, appLanguage = "en"): Promise<Lookup | null> {
  const word = wordOf(selection);
  if (!word) return null;
  const lang = languageOf(bookLanguage) ?? languageOf(appLanguage) ?? "en";
  const key = `${lang}:${word}`;
  const known = asked.get(key);
  if (known) return known;

  let reached = false;
  const ask = async <T>(question: () => Promise<T>): Promise<T | null> => {
    try {
      const answer = await question();
      reached = true;
      return answer;
    } catch {
      return null;
    }
  };

  let found = word;
  let { senses, lemma } = { senses: [] as Sense[], lemma: null as string | null };
  for (const spelling of new Set([word, word.toLowerCase()])) {
    const got = sensesIn(await ask(() => wiktionary(spelling)), lang);
    if (got.senses.length) {
      ({ senses, lemma } = got);
      found = spelling;
      break;
    }
  }

  const answer: Lookup = { word: found, senses, more: `https://en.wiktionary.org/wiki/${title(found)}` };
  // A word as it's written in the text gets what the word it comes from means.
  if (lemma && lemma !== found) {
    const root = sensesIn(await ask(() => wiktionary(lemma)), lang);
    if (root.senses.length) Object.assign(answer, { word: lemma, form: found, senses: root.senses, more: `https://en.wiktionary.org/wiki/${title(lemma)}` });
  }
  // A name, a place, or anything Wiktionary doesn't have: Wikipedia, in the book's language.
  if (!answer.senses.length || answer.senses.every((s) => /^proper noun$/i.test(s.part))) {
    const wiki = summaryOf(await ask(() => wikipedia(word, lang)), lang);
    if (wiki) {
      answer.wiki = wiki;
      if (!answer.senses.length) answer.more = wiki.url;
    }
  }
  if (!reached) throw new Error(t("Shelfed couldn't look that up. Check you're online, and try again."));
  if (asked.size >= 200) asked.delete(asked.keys().next().value!);
  asked.set(key, answer);
  return answer;
}
