import { describe, expect, it } from "vitest";
import { baseName, isBookFile, isSafeBookPath, isSafeName, lockedBy } from "../src/main/kindle-files";

/** A file's bytes, as a read of part of it would give them. */
const reading = (bytes: Buffer) => async (offset: number, length: number) => bytes.subarray(offset, offset + length);
const unreadable = async () => null;

/** A MOBI with its first record at 100, and this encryption in its header. */
function mobi(encryption: number) {
  const bytes = Buffer.alloc(200);
  bytes.write("BOOKMOBI", 60, "latin1");
  bytes.writeUInt32BE(100, 78);
  bytes.writeUInt16BE(encryption, 112);
  return bytes;
}

describe("what counts as a book on a Kindle", () => {
  it.each(["a.azw", "a.azw3", "a.kfx", "a.mobi", "a.prc", "a.pdf", "a.txt", "a.epub", "a.docx", "A.AZW3", "sub/dir/a.pdf"])("%s is", (name) => {
    expect(isBookFile(name)).toBe(true);
  });

  it.each(["a.png", "a.sdr", "a.apnx", "azw3", "My Clippings.txt", "my clippings.TXT", "sub/My Clippings.txt"])("%s isn't", (name) => {
    expect(isBookFile(name)).toBe(false);
  });

  it("takes the last part of a path, whichever way its slashes lean", () => {
    expect(baseName("a/b/c.pdf")).toBe("c.pdf");
    expect(baseName("a\\b\\c.pdf")).toBe("c.pdf");
    expect(baseName("c.pdf")).toBe("c.pdf");
  });
});

describe("names from a device", () => {
  it.each(["Dune.azw3", "Žluťoučký kůň.epub", "本.pdf", "emoji 😀.txt", ".hidden", "a..b.azw3", "x".repeat(255)])("%s is plain", (name) => {
    expect(isSafeName(name)).toBe(true);
  });

  it.each(["", ".", "..", "a/b", "a\\b", "a\u0000b", "a\nb", "a\u007fb", "a\u202eb", "a\u2067b", "x".repeat(256)])("%j isn't", (name) => {
    expect(isSafeName(name)).toBe(false);
  });

  it("checks every part of a path, and that it ends in a book", () => {
    expect(isSafeBookPath("a/b/Dune.azw3")).toBe(true);
    expect(isSafeBookPath("../Dune.azw3")).toBe(false);
    expect(isSafeBookPath("a//Dune.azw3")).toBe(false);
    expect(isSafeBookPath("/Dune.azw3")).toBe(false);
    expect(isSafeBookPath("a/b/picture.png")).toBe(false);
    expect(isSafeBookPath("My Clippings.txt")).toBe(false);
  });
});

describe("whether a book is locked to its Kindle", () => {
  it("always is as KFX, without looking inside", async () => {
    expect(await lockedBy("a.kfx", () => Promise.reject(new Error("shouldn't read")))).toBe(true);
  });

  it("never is in a format Amazon doesn't lock, without looking inside", async () => {
    for (const name of ["a.pdf", "a.txt", "a.epub"]) expect(await lockedBy(name, () => Promise.reject(new Error("shouldn't read")))).toBe(false);
  });

  it("is when a MOBI's header says it's encrypted, in either scheme", async () => {
    expect(await lockedBy("a.azw", reading(mobi(1)))).toBe(true);
    expect(await lockedBy("a.azw", reading(mobi(2)))).toBe(true);
  });

  it("isn't when the header says it isn't", async () => {
    expect(await lockedBy("a.azw3", reading(mobi(0)))).toBe(false);
  });

  it("is as Topaz", async () => {
    const bytes = Buffer.alloc(100);
    bytes.write("TPZ", 0, "latin1");
    expect(await lockedBy("a.azw", reading(bytes))).toBe(true);
  });

  it("isn't when the file is too short or isn't a MOBI at all", async () => {
    expect(await lockedBy("a.mobi", reading(Buffer.alloc(10)))).toBe(false);
    expect(await lockedBy("a.mobi", reading(Buffer.alloc(200)))).toBe(false);
  });

  it("isn't when the header is cut off before the encryption", async () => {
    expect(await lockedBy("a.mobi", reading(mobi(2).subarray(0, 105)))).toBe(false);
  });

  it("goes by Amazon's mark on the name when the file can't be read", async () => {
    expect(await lockedBy("Dune_B000ABC_EBOK.azw", unreadable)).toBe(true);
    expect(await lockedBy("Sample_B000ABC_EBSP.azw", unreadable)).toBe(true);
    expect(await lockedBy("Dune - Frank Herbert.azw3", unreadable)).toBe(false);
  });

  it("does the same when only the second read fails", async () => {
    const bytes = mobi(0);
    const firstOnly = async (offset: number, length: number) => (offset === 0 ? bytes.subarray(0, length) : null);
    expect(await lockedBy("Dune_EBOK.azw", firstOnly)).toBe(true);
    expect(await lockedBy("Dune.azw3", firstOnly)).toBe(false);
  });
});
