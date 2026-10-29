import { describe, expect, it } from "vitest";
import { connectsLikeAPhone, kindleById } from "../src/shared/kindles";
import { booksOnKindle, finishedOnKindle } from "../src/renderer/src/lib/onkindle";
import { book } from "./helpers";

describe("books already on a Kindle", () => {
  const pride = book({ title: "Pride and Prejudice", authors: ["Jane Austen"], formats: [{ ext: "azw3", file: "Pride and Prejudice - Jane Austen.azw3", size: 1 }] });
  const it_ = book({ title: "It", authors: ["Stephen King"] });
  const dracula = book({ title: "Dracula", authors: ["Bram Stoker"] });
  const gatsby = book({ title: "The Great Gatsby", authors: ["F. Scott Fitzgerald"] });

  it("knows a book Shelfed copied, by its file name", () => {
    expect(booksOnKindle([pride], ["Pride and Prejudice - Jane Austen.azw3"])).toEqual(new Set([pride.id]));
  });

  it("knows books copied by other apps or sent by email, by their title", () => {
    const on = booksOnKindle([dracula, gatsby], ["Dracula - Bram Stoker.mobi", "The Great Gatsby_ABC123XYZ0_EBOK.azw", "Notes.txt"]);
    expect(on).toEqual(new Set([dracula.id, gatsby.id]));
  });

  it("doesn't let a short title claim every file that starts with it", () => {
    expect(booksOnKindle([it_], ["It Ends with Us.azw3"]).size).toBe(0);
    expect(booksOnKindle([it_], ["It.azw3"])).toEqual(new Set([it_.id]));
  });

  it("doesn't take a longer title that starts with a book's for the book", () => {
    const dune = book({ title: "Dune", authors: ["Frank Herbert"] });
    expect(booksOnKindle([dune], ["Dune Messiah - Frank Herbert.azw3", "Dune Messiah_B00ABCDEFG_EBOK.azw"]).size).toBe(0);
    expect(booksOnKindle([dune], ["Dune - Frank Herbert.azw3"])).toEqual(new Set([dune.id]));
    expect(booksOnKindle([dune], ["Dune - Herbert.mobi"])).toEqual(new Set([dune.id]));
  });

  it("finds nothing on an empty Kindle", () => {
    expect(booksOnKindle([pride, dracula], []).size).toBe(0);
  });
});

describe("Kindles that connect like a phone", () => {
  it("are the ones from 2024 on", () => {
    expect(connectsLikeAPhone(kindleById("colorsoft"))).toBe(true);
    expect(connectsLikeAPhone(kindleById("pw6"))).toBe(true);
    expect(connectsLikeAPhone(kindleById("pw5"))).toBe(false);
    expect(connectsLikeAPhone(undefined)).toBe(false);
  });
});

describe("finished books still on a Kindle", () => {
  it("are the finished ones among those on it, with their files and the room they take", () => {
    const done = book({ title: "Dracula", authors: ["Bram Stoker"], status: "finished" });
    const reading = book({ title: "The Great Gatsby", authors: ["F. Scott Fitzgerald"], status: "reading" });
    const notThere = book({ title: "Emma", authors: ["Jane Austen"], status: "finished" });
    const files = [
      { name: "Dracula - Bram Stoker.azw3", path: "Dracula - Bram Stoker.azw3", size: 1_000 },
      { name: "Dracula_B00ABCDEFG_EBOK.azw", path: "Amazon/Dracula_B00ABCDEFG_EBOK.azw", size: 500 },
      { name: "The Great Gatsby - F. Scott Fitzgerald.azw3", path: "The Great Gatsby - F. Scott Fitzgerald.azw3", size: 2_000 },
      { name: "Notes.txt", path: "Notes.txt", size: 10 },
    ];
    const found = finishedOnKindle([done, reading, notThere], files);
    expect(found.books.map((b) => b.id)).toEqual([done.id]);
    expect(found.files.map((f) => f.path)).toEqual(["Dracula - Bram Stoker.azw3", "Amazon/Dracula_B00ABCDEFG_EBOK.azw"]);
    expect(found.bytes).toBe(1_500);
  });

  it("never include an unfinished sequel whose title begins with a finished book's", () => {
    const dune = book({ title: "Dune", authors: ["Frank Herbert"], status: "finished" });
    const messiah = book({ title: "Dune Messiah", authors: ["Frank Herbert"], status: "unread" });
    const files = [
      { name: "Dune - Frank Herbert.azw3", path: "Dune - Frank Herbert.azw3", size: 1 },
      { name: "Dune Messiah - Frank Herbert.azw3", path: "Dune Messiah - Frank Herbert.azw3", size: 1 },
    ];
    expect(finishedOnKindle([dune, messiah], files).files.map((f) => f.path)).toEqual(["Dune - Frank Herbert.azw3"]);
  });
});

