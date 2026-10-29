import { describe, expect, it } from "vitest";
import { connectsLikeAPhone, kindleById } from "../src/shared/kindles";
import { booksOnKindle } from "../src/renderer/src/lib/onkindle";
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
