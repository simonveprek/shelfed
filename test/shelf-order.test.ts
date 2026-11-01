import { describe, expect, it } from "vitest";
import { commonplaceMarkdown, gatherHighlights, nextInSeries } from "../src/renderer/src/lib/commonplace";
import { boxSets, hueOf, rainbowOrder, readingPile, standTogether } from "../src/renderer/src/lib/shelf-order";
import { book } from "./helpers";

describe("the reading pile", () => {
  it("holds what's being read, the latest first", () => {
    const pile = readingPile([book({ id: "a", status: "reading", opened: 1 }), book({ id: "b", status: "unread", opened: 9 }), book({ id: "c", status: "reading", opened: 5 }), book({ id: "d", status: "finished", opened: 7 })]);
    expect(pile.map((b) => b.id)).toEqual(["c", "a"]);
  });

  it("stays a pile, however much is being read", () => {
    expect(readingPile(Array.from({ length: 12 }, (_, i) => book({ id: `${i}`, status: "reading", opened: i }))).length).toBe(5);
  });

  it("copes with a book never opened", () => {
    expect(readingPile([book({ id: "a", status: "reading" })]).length).toBe(1);
  });
});

describe("box sets", () => {
  const dune = (id: string, seriesIndex?: number) => book({ id, series: "Dune", seriesIndex });

  it("is a series with two or more here, not one alone", () => {
    expect([...boxSets([dune("a"), dune("b"), book({ id: "c", series: "Alone" }), book({ id: "d" })])]).toEqual(["Dune"]);
  });

  it("brings a set together where its first book stands, in reading order", () => {
    const out = standTogether([book({ id: "x" }), dune("c", 3), book({ id: "y" }), dune("a", 1), book({ id: "z" }), dune("b", 2)], new Set(["Dune"]));
    expect(out.map((b) => b.id)).toEqual(["x", "a", "b", "c", "y", "z"]);
  });

  it("puts a book with no number after those with one", () => {
    const out = standTogether([dune("n"), dune("b", 2), dune("a", 1)], new Set(["Dune"]));
    expect(out.map((b) => b.id)).toEqual(["a", "b", "n"]);
  });

  it("leaves everything else alone, and loses no one", () => {
    const books = [book({ id: "a", series: "Other" }), book({ id: "b" }), dune("c", 1)];
    expect(standTogether(books, new Set()).map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(standTogether(books, new Set(["Dune"])).length).toBe(3);
  });
});

describe("rainbow order", () => {
  it("knows a colour's place", () => {
    expect(hueOf("#ff0000")?.hue).toBe(0);
    expect(hueOf("#00ff00")?.hue).toBe(120);
    expect(hueOf("#0000ff")?.hue).toBe(240);
    expect(hueOf("#808080")?.saturation).toBe(0);
  });

  it.each(["", "red", "#fff", "var(--x)", "color-mix(in oklab, red, blue)"])("has no place for %j", (colour) => {
    expect(hueOf(colour)).toBeNull();
  });

  it("runs through the colours, with greys and blacks at the end, light to dark", () => {
    const order = rainbowOrder(["#0000ff", "#111111", "#ff0000", "#888888", "#00ff00", "#dddddd"], (c) => c);
    expect(order).toEqual(["#ff0000", "#00ff00", "#0000ff", "#dddddd", "#888888", "#111111"]);
  });

  it("copes with colours it can't place, and keeps every book", () => {
    expect(rainbowOrder(["var(--x)", "#ff0000"], (c) => c)).toEqual(["#ff0000", "var(--x)"]);
    expect(rainbowOrder([], (c: string) => c)).toEqual([]);
  });
});

describe("the commonplace book", () => {
  const line = (id: string, created: number, text: string, extra = {}) => ({ id, kind: "highlight" as const, created, text, ...extra });
  const moby = book({ id: "m", title: "Moby Dick", authors: ["Herman Melville"], annotations: [line("1", 5, "Call me Ishmael"), line("2", 9, "Žluťoučký kůň", { note: "A note here" }), { id: "3", kind: "bookmark" as const, created: 99 }] });
  const emma = book({ id: "e", title: "Emma", authors: ["Jane Austen"], annotations: [line("4", 20, "Handsome, clever and rich")] });
  const none = book({ id: "n", title: "Nothing marked" });

  it("gathers every line, the latest reading first, without bookmarks or books with none", () => {
    const entries = gatherHighlights([moby, none, emma]);
    expect(entries.map((e) => e.book.id)).toEqual(["e", "m"]);
    expect(entries[1].highlights.map((h) => h.id)).toEqual(["2", "1"]);
  });

  it("finds words whatever their accents or capitals", () => {
    expect(gatherHighlights([moby], "zlutoucky")[0].highlights.map((h) => h.id)).toEqual(["2"]);
    expect(gatherHighlights([moby], "ISHMAEL")[0].highlights.map((h) => h.id)).toEqual(["1"]);
  });

  it("finds notes, and every line of a book searched for by name", () => {
    expect(gatherHighlights([moby], "a note")[0].highlights.map((h) => h.id)).toEqual(["2"]);
    expect(gatherHighlights([moby, emma], "melville")[0].highlights.length).toBe(2);
  });

  it("needs every word, and finds nothing where nothing matches", () => {
    expect(gatherHighlights([moby], "ishmael rich")).toEqual([]);
  });

  it("skips a highlight with no words", () => {
    expect(gatherHighlights([book({ annotations: [{ id: "x", kind: "highlight", created: 1 }] })])).toEqual([]);
  });

  it("comes out as Markdown with its books, quotes and notes", () => {
    const md = commonplaceMarkdown(gatherHighlights([moby]));
    expect(md).toContain("# Moby Dick");
    expect(md).toContain("*Herman Melville*");
    expect(md).toContain("> Call me Ishmael");
    expect(md).toContain("A note here");
  });

  it("keeps a quote on one line", () => {
    expect(commonplaceMarkdown(gatherHighlights([book({ annotations: [line("x", 1, "one\n\ntwo")] })]))).toContain("> one two");
  });
});

describe("what's next in a series", () => {
  const one = (id: string, seriesIndex?: number, status: "unread" | "finished" = "unread", series = "Dune") => book({ id, series, seriesIndex, status });

  it("is the next one along", () => {
    expect(nextInSeries(one("a", 1), [one("a", 1), one("c", 3), one("b", 2)])?.id).toBe("b");
  });

  it("skips one already finished", () => {
    expect(nextInSeries(one("a", 1), [one("a", 1), one("b", 2, "finished"), one("c", 3)])?.id).toBe("c");
  });

  it("doesn't go backwards", () => {
    expect(nextInSeries(one("c", 3), [one("a", 1), one("c", 3)])).toBeNull();
  });

  it("stays in its own series, however it's written", () => {
    expect(nextInSeries(one("a", 1), [one("x", 2, "unread", "Other")])).toBeNull();
    expect(nextInSeries(one("a", 1), [one("b", 2, "unread", "DUNE")])?.id).toBe("b");
  });

  it("is nothing for a book in no series", () => {
    expect(nextInSeries(book({ id: "a" }), [book({ id: "b" })])).toBeNull();
  });
});
