import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

const fetch = vi.fn();
vi.mock("electron", () => ({ app: { getPath: () => tmpdir(), isPackaged: true }, net: { fetch } }));
const { descriptionIn, freeSummary, summaryIn } = await import("../src/main/catalogues");

const FEED = `<entry><content type="xhtml"><div>
<p>
Title:
Dracula
</p>
<p>
Summary:
"Dracula" by Bram Stoker is a Gothic novel &amp; a
<a href="//example.org">famous</a> one. (This is an automatically generated summary.)
</p>
<p>Author: Stoker, Bram</p>
</div></content></entry>`;

describe("a Gutenberg book's summary", () => {
  it("is read out of the book's feed, with only its own words", () => {
    expect(summaryIn(FEED)).toBe('"Dracula" by Bram Stoker is a Gothic novel & a famous one.');
  });

  it("is nothing when the feed has none", () => {
    expect(summaryIn("<entry><p>Author: Stoker, Bram</p></entry>")).toBeNull();
  });

  it("is only asked of Gutenberg, for one of its numbered books", async () => {
    fetch.mockResolvedValue({ ok: true, text: async () => FEED });
    await expect(freeSummary("pg:345")).resolves.toContain("Gothic novel");
    expect(fetch).toHaveBeenCalledWith("https://www.gutenberg.org/ebooks/345.opds", expect.anything());
    fetch.mockClear();
    await expect(freeSummary("pg:../../evil")).resolves.toBeNull();
    await expect(freeSummary("se:345")).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("a Standard Ebooks description", () => {
  it("comes out as plain paragraphs, without its links and styling", () => {
    const html = '<p>In <i>The Vultures</i>, <a href="x">a writer</a> plots &amp; schemes.</p> <p>Second   part.</p>';
    expect(descriptionIn(html)).toBe("In The Vultures, a writer plots & schemes.\n\nSecond part.");
  });

  it("stops at the end of a paragraph, not partway through one", () => {
    const html = `<p>${"a".repeat(100)}</p><p>${"b".repeat(100)}</p><p>${"c".repeat(100)}</p>`;
    expect(descriptionIn(html, 250).split("\n\n").map((p) => p[0])).toEqual(["a", "b"]);
  });

  it("keeps a first paragraph however long it is", () => {
    expect(descriptionIn(`<p>${"a".repeat(2000)}</p>`).length).toBe(2000);
  });

  it("is nothing when there's nothing to go on", () => {
    expect(descriptionIn("")).toBe("");
    expect(descriptionIn("<p>  </p>")).toBe("");
  });
});
