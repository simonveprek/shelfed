import { afterEach, describe, expect, it, vi } from "vitest";
import { ago, bestFormat, bytes, debounce, norm, plural, published, readingFormat, similarity, sortTitle } from "../src/renderer/src/lib/util";
import { book } from "./helpers";

describe("text helpers", () => {
  it("normalises accents, case and punctuation", () => {
    expect(norm("  Brontë, Charlotte!  ")).toBe("bronte charlotte");
    expect(norm("Moby-Dick; or, The Whale")).toBe("moby dick or the whale");
  });

  it("scores how alike two titles are", () => {
    expect(similarity("Pride and Prejudice", "Pride and Prejudice")).toBe(1);
    expect(similarity("Pride and Prejudice", "Pride & Prejudice")).toBeGreaterThan(0.75);
    expect(similarity("Pride and Prejudice", "Moby Dick")).toBeLessThan(0.3);
  });

  it("sorts titles without their articles", () => {
    expect(sortTitle("The Great Gatsby")).toBe("great gatsby");
    expect(sortTitle("A Tale of Two Cities")).toBe("tale of two cities");
  });

  it("counts and sizes things the way people say them", () => {
    expect(plural(1, "book")).toBe("1 book");
    expect(plural(2, "match", "matches")).toBe("2 matches");
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1536)).toBe("2 KB");
    expect(bytes(2.5 * 1024 ** 2)).toBe("2.5 MB");
    expect(bytes(50 * 1024 ** 2)).toBe("50 MB");
  });
});

describe("choosing a book's file", () => {
  it("reads an EPUB over a PDF, and reopens the file it was left in", () => {
    const b = book({ formats: [{ ext: "pdf", file: "a.pdf", size: 1 }, { ext: "epub", file: "a.epub", size: 1 }] });
    expect(bestFormat(b)).toBe("epub");
    expect(readingFormat({ ...b, readFormat: "pdf" })).toBe("pdf");
    expect(readingFormat({ ...b, readFormat: "mobi" })).toBe("epub");
  });
});

describe("debounce", () => {
  afterEach(() => vi.useRealTimers());

  it("runs once, with the last arguments, after things go quiet", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    d(3);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledExactlyOnceWith(3);
  });

  it("can be flushed, so nothing is lost when the window closes", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 1000);
    d("saved");
    d.flush();
    expect(fn).toHaveBeenCalledExactlyOnceWith("saved");
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("dates in words", () => {
  it("writes a published date as precisely as the book gives it", () => {
    expect(published("2021-01-17")).toBe("17 Jan 2021");
    expect(published("2021-01")).toBe("January 2021");
    expect(published("1813")).toBe("1813");
    expect(published("1813-01-28T00:00:00Z")).toBe("28 Jan 1813");
    expect(published("sometime")).toBe("sometime");
  });

  it("says how long ago, in words", () => {
    const now = Date.now();
    expect(ago(now - 20_000)).toBe("Just now");
    expect(ago(now - 60_000)).toBe("A minute ago");
    expect(ago(now - 5 * 60_000)).toBe("5 minutes ago");
    expect(ago(now - 3_600_000)).toBe("An hour ago");
    expect(ago(now - 3 * 3_600_000)).toBe("3 hours ago");
    expect(ago(now - 30 * 3_600_000)).toBe("Yesterday");
    expect(ago(now - 3 * 86_400_000)).toBe("3 days ago");
    expect(ago()).toBe("Never");
  });
});
