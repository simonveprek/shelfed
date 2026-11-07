import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetch = vi.fn();
vi.mock("electron", () => ({ app: { getPath: () => tmpdir(), isPackaged: true }, net: { fetch } }));
const { languageOf, lemmaIn, lookUp, plain, sensesIn, summaryOf, wordOf } = await import("../src/main/lookup");

// Wiktionary's real answers, cut down.
const KNIHOU = {
  cs: [{ partOfSpeech: "Noun", language: "Czech", definitions: [{ definition: '<span class="form-of-definition use-with-mention" about="#mwt3" typeof="mw:Transclusion"><a rel="mw:WikiLink" href="/wiki/Appendix:Glossary#instrumental_case" title="Appendix:Glossary">instrumental</a> <a rel="mw:WikiLink" href="/wiki/Appendix:Glossary#singular_number" title="Appendix:Glossary">singular</a> of <span class="form-of-definition-link"><i class="Latn mention" lang="cs"><a rel="mw:WikiLink" href="/wiki/kniha#Czech" title="kniha">kniha</a></i></span></span>' }] }],
  sk: [{ partOfSpeech: "Noun", language: "Slovak", definitions: [{ definition: '<span class="form-of-definition use-with-mention"> of <span class="form-of-definition-link"><a title="kniha">kniha</a></span></span>' }] }],
};
const KNIHA = {
  cs: [{ partOfSpeech: "Noun", language: "Czech", definitions: [
    { definition: '<a rel="mw:WikiLink" href="/wiki/book" title="book">book</a> <span class="mention-gloss-paren">(</span><span class="mention-gloss">a collection of sheets of paper bound together to hinge at one edge</span><span class="mention-gloss-paren">)</span>' },
    { definition: '<a href="/wiki/book">book</a> <span class="mention-gloss-paren">(</span><span class="mention-gloss">a major division of a published work</span><span class="mention-gloss-paren">)</span>' },
  ] }],
  other: [{ definitions: [{ definition: "never shown" }] }],
  sk: [{ partOfSpeech: "Noun", language: "Slovak", definitions: [{ definition: "book" }] }],
};
const MELANCHOLY = {
  en: [
    { partOfSpeech: "Noun", language: "English", definitions: [{ definition: '<span class="usage-label-sense"></span> <a href="/wiki/black_bile">Black bile</a>, formerly thought to be one of the four &quot;cardinal humours&quot;<sup>[1]</sup>.' }, { definition: "Great sadness or depression." }] },
    { partOfSpeech: "Adjective", language: "English", definitions: [{ definition: "Affected with great sadness." }] },
  ],
};
const GATSBY = { en: [{ partOfSpeech: "Proper noun", language: "English", definitions: [{ definition: '<span class="use-with-mention">A <a href="/wiki/surname">surname</a></span><link rel="mw:PageProp/Category" href="./Category:Surnames"/>' }] }] };
const PRAHA = { type: "standard", title: "Praha", extract: "Praha je hlavní a největší město České republiky.", content_urls: { desktop: { page: "https://cs.wikipedia.org/wiki/Praha" } } };

const answers = new Map<string, unknown>();
const asked: string[] = [];
function reply(url: string) {
  asked.push(url);
  if (answers.get("offline")) return Promise.reject(new Error("net::ERR_INTERNET_DISCONNECTED"));
  const answer = answers.get(url);
  if (answer === undefined) return Promise.resolve(new Response('{"status":404}', { status: 404 }));
  if (answer instanceof Response) return Promise.resolve(answer);
  return Promise.resolve(new Response(JSON.stringify(answer), { status: 200 }));
}
const wiktionary = (word: string) => `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
const wikipedia = (lang: string, word: string) => `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;

beforeEach(() => {
  answers.clear();
  asked.length = 0;
  fetch.mockReset();
  fetch.mockImplementation((url: string) => reply(url));
});

describe("what gets looked up", () => {
  it.each([
    ["„knihou“", "knihou"],
    ["  melancholy, ", "melancholy"],
    ["(Gatsby's)", "Gatsby's"],
    ["Long\n Island.", "Long Island"],
    ["žluťoučký", "žluťoučký"],
  ])("takes %j as %j", (selection, word) => {
    expect(wordOf(selection)).toBe(word);
  });

  it.each(["", "  ", "1984", "…", "one two three four five", "x".repeat(65)])("won't look up %j", (selection) => {
    expect(wordOf(selection)).toBeNull();
  });

  it("reads a language from a tag, and nothing else as one", () => {
    expect(languageOf("cs-CZ")).toBe("cs");
    expect(languageOf("EN")).toBe("en");
    expect(languageOf("hsb")).toBe("hsb");
    for (const tag of ["", "x", "evil.example/", "cs.evil.com", "../cs", "english", undefined]) expect(languageOf(tag)).toBeNull();
  });
});

describe("reading Wiktionary's answers", () => {
  it("turns its HTML into plain words", () => {
    expect(plain(KNIHA.cs[0].definitions[0].definition)).toBe("book (a collection of sheets of paper bound together to hinge at one edge)");
    expect(plain(MELANCHOLY.en[0].definitions[0].definition)).toBe('Black bile, formerly thought to be one of the four "cardinal humours".');
    expect(plain("a &amp; b &#x17E; &#382; &bogus; &#0;")).toBe("a & b ž ž &bogus;");
    expect(plain("<script>alert(1)</script>safe<style>x{}</style>")).toBe("safe");
  });

  it("knows a form of a word, and which word it's a form of", () => {
    expect(lemmaIn(KNIHOU.cs[0].definitions[0].definition)).toBe("kniha");
    expect(lemmaIn(KNIHA.cs[0].definitions[0].definition)).toBeNull();
  });

  it("gives the book's own language, and only that when it has an answer", () => {
    const { senses, lemma } = sensesIn(KNIHA, "cs");
    expect(senses).toEqual([{ part: "Noun", language: "Czech", code: "cs", meanings: ["book (a collection of sheets of paper bound together to hinge at one edge)", "book (a major division of a published work)"] }]);
    expect(lemma).toBeNull();
    expect(sensesIn(KNIHOU, "cs").lemma).toBe("kniha");
  });

  it("falls back to other languages, never to its 'other' list", () => {
    const { senses } = sensesIn(KNIHA, "de");
    expect(senses.map((s) => s.code)).toEqual(["cs", "sk"]);
  });

  it("stops at three kinds of word and three meanings each", () => {
    const many = { en: Array.from({ length: 5 }, (_, i) => ({ partOfSpeech: `Part ${i}`, definitions: Array.from({ length: 6 }, (_, j) => ({ definition: `meaning ${j}` })) })) };
    const { senses } = sensesIn(many, "en");
    expect(senses).toHaveLength(3);
    expect(senses.every((s) => s.meanings.length === 3)).toBe(true);
  });

  it.each([null, "text", 42, [], [{}], { cs: "no" }, { cs: [null, { definitions: "no" }, { definitions: [null, 5, { definition: 7 }] }] }])("shrugs off %j", (answer) => {
    expect(sensesIn(answer, "cs")).toEqual({ senses: [], lemma: null });
  });

  it("takes Wikipedia's article, not its lists of meanings, and keeps its links on Wikipedia", () => {
    expect(summaryOf(PRAHA, "cs")).toEqual({ title: "Praha", extract: PRAHA.extract, url: "https://cs.wikipedia.org/wiki/Praha" });
    expect(summaryOf({ ...PRAHA, type: "disambiguation" }, "cs")).toBeUndefined();
    expect(summaryOf({ ...PRAHA, content_urls: { desktop: { page: "https://evil.example/Praha" } } }, "cs")?.url).toBe("https://cs.wikipedia.org/wiki/Praha");
    const long = summaryOf({ ...PRAHA, extract: `${"A sentence that goes on. ".repeat(40)}` }, "cs")!;
    expect(long.extract.length).toBeLessThanOrEqual(600);
    expect(long.extract.endsWith(".")).toBe(true);
  });
});

describe("looking up a word", () => {
  it("leads a word as it's written to the word it comes from", async () => {
    answers.set(wiktionary("knihou"), KNIHOU);
    answers.set(wiktionary("kniha"), KNIHA);
    const found = await lookUp("knihou,", "cs");
    expect(found).toMatchObject({ word: "kniha", form: "knihou", more: "https://en.wiktionary.org/wiki/kniha" });
    expect(found!.senses[0].meanings[0]).toMatch(/^book/);
    expect(found!.wiki).toBeUndefined();
  });

  it("asks once for the same word", async () => {
    answers.set(wiktionary("melancholy"), MELANCHOLY);
    await lookUp("melancholy", "en");
    await lookUp("melancholy.", "en-GB");
    expect(asked).toEqual([wiktionary("melancholy")]);
  });

  it("tries the word in lower case when it starts a sentence", async () => {
    answers.set(wiktionary("melancholy"), MELANCHOLY);
    expect((await lookUp("Melancholy", "en"))!.word).toBe("melancholy");
    expect(asked).toEqual([wiktionary("Melancholy"), wiktionary("melancholy")]);
  });

  it("asks Wikipedia about a name, in the book's language", async () => {
    answers.set(wiktionary("Gatsby"), GATSBY);
    answers.set(wikipedia("cs", "Gatsby"), { ...PRAHA, title: "Velký Gatsby", extract: "Román F. Scotta Fitzgeralda.", content_urls: { desktop: { page: "https://cs.wikipedia.org/wiki/Velk%C3%BD_Gatsby" } } });
    const found = await lookUp("Gatsby", "cs");
    expect(found!.senses[0].part).toBe("Proper noun");
    expect(found!.wiki?.title).toBe("Velký Gatsby");
  });

  it("asks Wikipedia when Wiktionary hasn't got it, and points there for more", async () => {
    answers.set(wikipedia("cs", "Praha"), PRAHA);
    const found = await lookUp("Praha", "cs-CZ");
    expect(found).toMatchObject({ word: "Praha", senses: [], more: "https://cs.wikipedia.org/wiki/Praha" });
  });

  it("says it found nothing when nobody has it", async () => {
    expect(await lookUp("xqzzyv", "en")).toMatchObject({ word: "xqzzyv", senses: [] });
  });

  it("says plainly when it can't ask anyone", async () => {
    answers.set("offline", true);
    await expect(lookUp("offline", "en")).rejects.toThrow("couldn't look that up");
  });

  it("isn't fooled by a server error into saying there's nothing", async () => {
    fetch.mockImplementation((url: string) => (asked.push(url), Promise.resolve(new Response("busy", { status: 503 }))));
    await expect(lookUp("busy", "en")).rejects.toThrow("couldn't look that up");
  });

  it("won't read an answer that's far too long", async () => {
    answers.set(wiktionary("huge"), new Response("x".repeat(2_000_001), { status: 200 }));
    answers.set(wiktionary("long"), new Response(new ReadableStream({ pull: (c) => c.enqueue(new Uint8Array(65_536)) }), { status: 200 }));
    expect(await lookUp("huge", "en")).toMatchObject({ senses: [] });
    expect(await lookUp("long", "en")).toMatchObject({ senses: [] });
  });

  it("only ever asks Wiktionary and Wikipedia, whatever the book says its language is", async () => {
    for (const tag of ["evil.example/x", "cs.evil.com", "../../", "a b"]) await lookUp(`Word${tag.length}`, tag, "cs");
    for (const url of asked) expect(new URL(url).host).toMatch(/^(en\.wiktionary|cs\.wikipedia)\.org$/);
  });

  it("asks nothing for what isn't a word", async () => {
    expect(await lookUp("1984", "en")).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe("the edges of looking up", () => {
  it.each([
    ["well-known", "well-known"],
    ["„Gatsby’s“", "Gatsby’s"],
    ["l’amour", "l’amour"],
    ["e\u0301te\u0301", "été"],
    ["ŽLUŤOUČKÝ!", "ŽLUŤOUČKÝ"],
  ])("keeps %j whole as %j", (selection, word) => {
    expect(wordOf(selection)).toBe(word);
  });

  it("drops what isn't text: tags, scripts and references", () => {
    expect(plain('<a href="x">link</a> <sup>[3]</sup>text <i>it</i>&nbsp;ok')).toBe("link text it ok");
    expect(plain("<style>.x{color:red}</style><b>bold</b> , comma")).toBe("bold, comma");
  });

  it("names a kind of word and language plainly, at a sane length", () => {
    const long = "x".repeat(100);
    const { senses } = sensesIn({ en: [{ partOfSpeech: long, language: long, definitions: [{ definition: "y".repeat(900) }] }] }, "en");
    expect(senses[0].part).toHaveLength(40);
    expect(senses[0].language).toHaveLength(40);
    expect(senses[0].meanings[0].length).toBeLessThanOrEqual(400);
  });

  it("takes a form of a word only when every meaning says it's that one word", () => {
    const mixed = { cs: [{ partOfSpeech: "Noun", definitions: [{ definition: KNIHOU.cs[0].definitions[0].definition }, { definition: "a meaning of its own" }] }] };
    expect(sensesIn(mixed, "cs").lemma).toBeNull();
  });

  it("asks Wikipedia in the app's language when the book doesn't say", async () => {
    answers.set(wikipedia("cs", "Vltava"), { ...PRAHA, title: "Vltava", extract: "Nejdelší česká řeka." });
    expect((await lookUp("Vltava", undefined, "cs"))!.wiki?.title).toBe("Vltava");
    expect(asked.at(-1)).toBe(wikipedia("cs", "Vltava"));
  });

  it("asks once even when one place couldn't be reached, and says so plainly when neither could", async () => {
    fetch.mockImplementation((url: string) => (asked.push(url), url.includes("wiktionary") ? Promise.reject(new Error("down")) : reply(url)));
    answers.set(wikipedia("en", "Somewhere"), { ...PRAHA, title: "Somewhere", extract: "A place." });
    expect((await lookUp("Somewhere", "en"))!.wiki?.extract).toBe("A place.");
  });

  it("won't keep more than it needs", async () => {
    for (let i = 0; i < 205; i++) await lookUp(`word${String.fromCharCode(97 + (i % 26))}${i}x`, "en");
    asked.length = 0;
    await lookUp("worda0x", "en");
    // The oldest answers were let go, so the first word is asked again.
    expect(asked.length).toBeGreaterThan(0);
  });
});
