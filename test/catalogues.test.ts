import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

const fetch = vi.fn();
vi.mock("electron", () => ({ app: { getPath: () => tmpdir(), isPackaged: true }, net: { fetch } }));
const { freeSummary, summaryIn } = await import("../src/main/catalogues");

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
    expect(summaryIn(FEED)).toBe('"Dracula" by Bram Stoker is a Gothic novel & a famous one. (This is an automatically generated summary.)');
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
