import { afterEach, describe, expect, it } from "vitest";
import { addWords, fromLocale, setLanguage, t, tn } from "../src/shared/i18n";

addWords("cs", {
  "Add books": "Přidat knihy",
  "Added {n} books from {place}": "Přidáno {n} knih z {place}",
  "{n} book|{n} books": "{n} kniha|{n} knihy|{n} knih",
});

afterEach(() => setLanguage("en"));

describe("speaking more than one language", () => {
  it("follows the system: Czech for a Czech locale, English for any other", () => {
    expect(fromLocale("cs-CZ")).toBe("cs");
    expect(fromLocale("cs")).toBe("cs");
    expect(fromLocale("sk-SK")).toBe("en");
    expect(fromLocale("en-US")).toBe("en");
    expect(fromLocale(undefined)).toBe("en");
  });

  it("gives English as written, and the Czech once chosen", () => {
    expect(t("Add books")).toBe("Add books");
    setLanguage("cs");
    expect(t("Add books")).toBe("Přidat knihy");
  });

  it("keeps a text with no translation yet in English", () => {
    setLanguage("cs");
    expect(t("Something new")).toBe("Something new");
  });

  it("fills in the blanks", () => {
    setLanguage("cs");
    expect(t("Added {n} books from {place}", { n: 3, place: "Calibre" })).toBe("Přidáno 3 knih z Calibre");
  });

  it("counts the Czech way: one, a few, many", () => {
    expect(tn(1, "{n} book", "{n} books")).toBe("1 book");
    expect(tn(3, "{n} book", "{n} books")).toBe("3 books");
    setLanguage("cs");
    expect([0, 1, 2, 4, 5, 21, 1.5].map((n) => tn(n, "{n} book", "{n} books"))).toEqual(["0 knih", "1 kniha", "2 knihy", "4 knihy", "5 knih", "21 knih", "1,5 knih"]);
    expect(tn(12000, "{n} book", "{n} books")).toBe("12\u00a0000 knih");
  });
});
