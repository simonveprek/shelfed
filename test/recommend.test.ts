import { describe, expect, it } from "vitest";
import { seedsOf, suggestionsFor } from "../src/renderer/src/lib/recommend";
import { book } from "./helpers";

describe("suggestions for a book", () => {
  it("follows Jane Eyre with Wuthering Heights, as a free classic", () => {
    const jane = book({ title: "Jane Eyre: An Autobiography", authors: ["Charlotte Brontë"] });
    const [first] = suggestionsFor(jane, [jane]);
    expect(first).toMatchObject({ kind: "free", title: "Wuthering Heights", author: "Emily Brontë" });
    expect(first.why).toMatch(/Brontë/);
  });

  it("points at your own copy when you already have it", () => {
    const jane = book({ title: "Jane Eyre", authors: ["Charlotte Bronte"] });
    const heights = book({ title: "Wuthering Heights", authors: ["Emily Brontë"] });
    const list = suggestionsFor(jane, [jane, heights]);
    expect(list[0]).toMatchObject({ kind: "owned" });
    expect(list[0].kind === "owned" && list[0].book.id).toBe(heights.id);
    expect(list.some((s) => s.kind === "free" && s.title === "Wuthering Heights")).toBe(false);
  });

  it("needs the author to agree for short titles", () => {
    const emma = book({ title: "Emma", authors: ["Someone Else"] });
    expect(suggestionsFor(emma, [emma]).some((s) => s.kind === "free")).toBe(false);
  });

  it("never suggests the book itself", () => {
    const dracula = book({ title: "Dracula", authors: ["Bram Stoker"], tags: ["Vampires -- Fiction", "Horror tales"] });
    expect(suggestionsFor(dracula, [dracula]).some((s) => s.kind === "owned" && s.book.id === dracula.id)).toBe(false);
  });

  it("finds the next book in a series, then the same author, then shared subjects", () => {
    const one = book({ title: "Seed", authors: ["A. Writer"], series: "Saga", seriesIndex: 1, tags: ["Sea stories"] });
    const two = book({ title: "Next", authors: ["Other"], series: "Saga", seriesIndex: 2 });
    const same = book({ title: "Same Author", authors: ["A. Writer"] });
    const sea = book({ title: "Sea", authors: ["Third"], tags: ["Sea stories", "Whaling"] });
    const none = book({ title: "Nothing in common", authors: ["Fourth"], tags: ["Cookery"] });
    const list = suggestionsFor(one, [one, two, same, sea, none]);
    const ids = list.map((s) => (s.kind === "owned" ? s.book.id : s.title));
    expect(ids).toEqual([two.id, same.id, sea.id]);
    expect(list[0].why).toBe("Next in Saga");
    expect(list[2].why).toBe("Shared subjects: Sea stories");
  });

  it("puts books you've already read last", () => {
    const seed = book({ title: "Seed", authors: ["A. Writer"] });
    const read = book({ title: "Read", authors: ["A. Writer"], status: "finished" });
    const unread = book({ title: "Unread", authors: ["A. Writer"] });
    const ids = suggestionsFor(seed, [seed, read, unread]).map((s) => s.kind === "owned" && s.book.id);
    expect(ids).toEqual([unread.id, read.id]);
  });
});

describe("what your taste is learned from", () => {
  it("uses finished, well-begun, loved and favourite books, newest first", () => {
    const finished = book({ status: "finished", finishedAt: 300 });
    const begun = book({ status: "reading", progress: 0.4, opened: 200 });
    const barely = book({ status: "reading", progress: 0.05, opened: 400 });
    const loved = book({ rating: 5, opened: 100 });
    const fav = book({ favorite: true, opened: 50 });
    expect(seedsOf([barely, loved, begun, finished, fav], 5).map((b) => b.id)).toEqual([finished.id, begun.id, loved.id, fav.id]);
  });
});
