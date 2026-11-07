import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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

describe("everything the newer work says", () => {
  // The app's real dictionaries, added to the small one above.
  beforeAll(() => import("../src/shared/locales"));

  /** The strings given to t() or tn() in a file, as they're written there. */
  function said(path: string) {
    const source = readFileSync(join(import.meta.dirname, "..", path), "utf8");
    const one = [...source.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const plural = [...source.matchAll(/\btn\(\s*[^,]+,\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => `${m[1]}|${m[2]}`);
    const constants = [...source.matchAll(/export const (?:PHONE_LIKE|BUSY_KINDLE) = "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    return [...one, ...plural, ...constants];
  }

  it.each(["src/main/mtp/index.ts", "src/renderer/src/lib/kindle.ts", "src/renderer/src/components/KindleDock.tsx", "src/renderer/src/lib/actions.ts", "src/main/lookup.ts", "src/renderer/src/reader/Lookup.tsx", "src/renderer/src/components/PdfToEpub.tsx", "src/renderer/src/lib/pdf-epub.ts"])("is in Czech in %s", async (path) => {
    setLanguage("cs");
    try {
      const strings = said(path);
      expect(strings.length).toBeGreaterThan(0);
      const missing = strings.filter((text) => {
        const [one, many] = text.split("|");
        return many ? tn(5, one, many) === many.replace("{n}", "5") && tn(1, one, many) === one.replace("{n}", "1") : t(text) === text;
      });
      expect(missing).toEqual([]);
    } finally {
      setLanguage("en");
    }
  });
});
