import { describe, expect, it } from "vitest";
import { findCopies, inherit, sameBook } from "../src/renderer/src/lib/copies";
import { book } from "./helpers";

const epub = { ext: "epub", file: "a.epub", size: 1 };
const mobi = { ext: "mobi", file: "a.mobi", size: 1 };
const pdf = { ext: "pdf", file: "a.pdf", size: 1 };

describe("copies of one book", () => {
  it("are the same title and authors in formats that don't overlap", () => {
    const a = book({ title: "The King of the West: (Path of the Ranger Book 7)", authors: ["Pedro Urvi"], formats: [epub] });
    const b = book({ title: "The king of the West (Path of the Ranger, Book 7)", authors: ["pedro urvi"], formats: [mobi] });
    expect(sameBook(a, b)).toBe(true);
  });

  it("aren't two books both in EPUB, which may be different books with one title", () => {
    const a = book({ title: "Collected Poems", authors: ["W. B. Yeats"], formats: [epub] });
    const b = book({ title: "Collected Poems", authors: ["W. B. Yeats"], formats: [epub] });
    expect(sameBook(a, b)).toBe(false);
  });

  it("aren't books by different authors or with different titles", () => {
    expect(sameBook(book({ title: "Emma", authors: ["Jane Austen"], formats: [epub] }), book({ title: "Emma", authors: ["Someone Else"], formats: [mobi] }))).toBe(false);
    expect(sameBook(book({ title: "Emma", authors: ["Jane Austen"], formats: [epub] }), book({ title: "Persuasion", authors: ["Jane Austen"], formats: [mobi] }))).toBe(false);
  });

  it("are found in a library, keeping the copy that knows most", () => {
    const plain = book({ title: "Emma", authors: ["Jane Austen"], formats: [mobi], added: 1 });
    const rich = book({ title: "Emma", authors: ["Jane Austen"], formats: [epub], series: "Novels", description: "…", added: 2 });
    const third = book({ title: "Emma", authors: ["Jane Austen"], formats: [epub], added: 3 });
    const other = book({ title: "Persuasion", authors: ["Jane Austen"], formats: [pdf] });
    const found = findCopies([plain, rich, third, other]);
    expect(found).toHaveLength(1);
    expect(found[0].keep.id).toBe(rich.id);
    // The second EPUB brings nothing new, so it isn't joined.
    expect(found[0].copies.map((b) => b.id)).toEqual([plain.id]);
  });

  it("can be looked for among some books only", () => {
    const a = book({ title: "Emma", authors: ["Jane Austen"], formats: [epub] });
    const b = book({ title: "Emma", authors: ["Jane Austen"], formats: [mobi] });
    expect(findCopies([a, b], new Set(["nobody"]))).toEqual([]);
    expect(findCopies([a, b], new Set([b.id]))).toHaveLength(1);
  });

  it("hand over what was done with them: progress, notes, rating, collections", () => {
    const keep = book({ title: "Emma", formats: [epub], rating: 0, tags: ["Classic"], collections: ["c1"] });
    const copy = book({
      title: "Emma", formats: [mobi], rating: 4, favorite: true, tags: ["Romance"], collections: ["c2"], series: "Novels", seriesIndex: 4,
      status: "reading", progress: 0.4, location: "epubcfi(/6/4)", readFormat: "mobi", readSeconds: 600,
      annotations: [{ id: "n1", cfi: "x", text: "a line", created: 1 } as never],
    });
    expect(inherit(keep, [copy])).toEqual({
      series: "Novels", seriesIndex: 4, tags: ["Classic", "Romance"], collections: ["c1", "c2"], rating: 4, favorite: true,
      status: "reading", progress: 0.4, location: "epubcfi(/6/4)", readFormat: "mobi", annotations: [copy.annotations![0]], readSeconds: 600,
    });
  });

  it("aren't two books of one series, even with one title", () => {
    const three = book({ title: "Untitled", authors: ["Pedro Urvi"], series: "Path of the Ranger", seriesIndex: 3, formats: [epub] });
    const seven = book({ title: "Untitled", authors: ["Pedro Urvi"], series: "Path of the Ranger", seriesIndex: 7, formats: [mobi] });
    expect(sameBook(three, seven)).toBe(false);
    expect(findCopies([three, seven])).toEqual([]);
  });
});

