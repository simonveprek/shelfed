import { describe, expect, it, vi } from "vitest";
import { book } from "./helpers";

// The real module talks to the store and the main process; only its ids matter here.
vi.mock("../src/renderer/src/lib/annotations", () => {
  let n = 0;
  return { newAnnotationId: () => `a${++n}` };
});

const { groupClippings, parseClippings, toAnnotations } = await import("../src/renderer/src/lib/clippings");

const FILE = `﻿Pride and Prejudice (Jane Austen)
- Your Highlight on page 5 | Location 70-72 | Added on Monday, 3 March 2025 21:10:05

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.
==========
Pride and Prejudice (Jane Austen)
- Your Note on page 5 | Location 72 | Added on Monday, 3 March 2025 21:10:30

The most famous opening line?
==========
Pride and Prejudice (Jane Austen)
- Your Bookmark on page 40 | Location 610 | Added on Monday, 3 March 2025 22:00:00


==========
Frankenstein (Mary Wollstonecraft Shelley)
- Your Highlight on Location 1200-1201 | Added on Tuesday, 4 March 2025 08:00:00

Beware; for I am fearless, and therefore powerful.
==========
A Book (With Parentheses) In Its Title (Some Author)
- Your Highlight on Location 10-11 | Added on Tuesday, 4 March 2025 08:00:00

Words.
==========
`;

describe("reading My Clippings.txt", () => {
  const clips = parseClippings(FILE);

  it("finds every highlight, note and bookmark", () => {
    expect(clips.map((c) => c.kind)).toEqual(["highlight", "note", "bookmark", "highlight", "highlight"]);
  });

  it("splits title and author, even with parentheses in the title", () => {
    expect(clips[0]).toMatchObject({ title: "Pride and Prejudice", author: "Jane Austen" });
    expect(clips[4]).toMatchObject({ title: "A Book (With Parentheses) In Its Title", author: "Some Author" });
  });

  it("keeps where it was and when", () => {
    expect(clips[0].where).toBe("page 5, Location 70-72");
    expect(clips[0].added).toBe(Date.parse("3 March 2025 21:10:05"));
  });

  it("copes with Windows line endings", () => {
    expect(parseClippings(FILE.replace(/\n/g, "\r\n"))).toHaveLength(5);
  });
});

describe("bringing clippings into the library", () => {
  const pride = book({ title: "Pride and Prejudice", authors: ["Jane Austen"] });
  const other = book({ title: "Pride and Prejudice and Zombies", authors: ["Seth Grahame-Smith"] });
  const groups = groupClippings(parseClippings(FILE), [other, pride]);

  it("matches each Kindle title to the right book", () => {
    expect(groups.find((g) => g.title === "Pride and Prejudice")?.book?.id).toBe(pride.id);
    expect(groups.find((g) => g.title === "Frankenstein")?.book).toBeUndefined();
  });

  it("joins a note to the highlight it belongs to", () => {
    const list = toAnnotations(groups.find((g) => g.book)!);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "kindle", note: "The most famous opening line?" });
    expect(list[0].text).toMatch(/^It is a truth/);
  });

  it("joins the note even when Kindle wrote it before the highlight", () => {
    const [h, n] = parseClippings(FILE).slice(0, 2);
    const list = toAnnotations({ title: "P", clippings: [n, h] });
    expect(list).toHaveLength(1);
    expect(list[0].note).toBe("The most famous opening line?");
  });

  it("adds nothing the second time the same file is imported", () => {
    const group = groups.find((g) => g.book)!;
    const first = toAnnotations(group);
    expect(toAnnotations(group, first)).toEqual([]);
  });
});
