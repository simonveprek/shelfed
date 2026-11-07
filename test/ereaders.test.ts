import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() }, safeStorage: { isEncryptionAvailable: () => false } }));
const { asIfPlugged, copyToDevice, deviceFiles, filesFromDevice, isPluggedIn, readerOn, removeFromDevice } = await import("../src/main/kindle");
const { isReaderBook, readerFile, READERS } = await import("../src/shared/ereaders");

let drive: string;
const put = async (path: string, text = "a book") => {
  await mkdir(join(drive, path, ".."), { recursive: true });
  await writeFile(join(drive, path), text);
};

beforeEach(async () => {
  drive = await mkdtemp(join(tmpdir(), "shelf-reader-"));
});
afterEach(async () => {
  asIfPlugged([]);
  await rm(drive, { recursive: true, force: true });
});

describe("telling e-readers apart by their folders", () => {
  it("knows a Kindle, a Kobo and a PocketBook, and nothing else", async () => {
    expect(await readerOn(drive)).toBeNull();
    await mkdir(join(drive, ".kobo"));
    expect(await readerOn(drive)).toBe("kobo");
    await rm(join(drive, ".kobo"), { recursive: true });
    await mkdir(join(drive, "system", "config"), { recursive: true });
    expect(await readerOn(drive)).toBe("pocketbook");
    // A Kindle has documents and system folders, so it's never taken for a PocketBook.
    await mkdir(join(drive, "documents"));
    expect(await readerOn(drive)).toBe("kindle");
  });

  it("doesn't take a USB stick with a documents folder for anything", async () => {
    await mkdir(join(drive, "documents"));
    expect(await readerOn(drive)).toBeNull();
  });

  it("takes a Kobo with folders of its owner's for a Kobo still", async () => {
    await mkdir(join(drive, "documents"));
    await mkdir(join(drive, "system"));
    await mkdir(join(drive, ".kobo"));
    expect(await readerOn(drive)).toBe("kobo");
  });

  it("counts only what Shelfed can read as a book", () => {
    for (const name of ["a.epub", "a.kepub.epub", "a.FB2", "a.cbz", "a.pdf", "a.mobi", "a.azw3", "a.txt", "a.docx", "a.html"]) expect(isReaderBook(name)).toBe(true);
    for (const name of ["a.jpg", "a.sqlite", "a.acsm", "a.djvu", "epub", "a.epub.part"]) expect(isReaderBook(name)).toBe(false);
  });
});

describe("a Kobo plugged in as a drive", () => {
  beforeEach(async () => {
    await put(".kobo/KoboReader.sqlite", "its database");
    await put(".kobo/kepub/0001-store-book", "a book bought from Kobo");
    await put("Digital Editions/library-loan.epub", "Adobe's");
    await put("Dracula - Bram Stoker.epub");
    await put("Classics/Austen/Emma - Jane Austen.epub");
    await put("Classics/cover.jpg", "a picture");
    await put("._Dracula - Bram Stoker.epub", "macOS's shadow file");
    await put("a/b/c/d/too deep.epub");
    asIfPlugged([{ name: "KOBOeReader", path: drive, free: 1, kind: "kobo" }]);
  });

  it("lists the books anywhere on it, but not its own, Adobe's or hidden ones", async () => {
    const files = (await deviceFiles(drive)).map((f) => f.path).sort();
    expect(files).toEqual(["Classics/Austen/Emma - Jane Austen.epub", "Dracula - Bram Stoker.epub"]);
  });

  it("takes copies at the top, where Kobo says books go", async () => {
    const book = join(drive, "..", `${Date.now()}-in.epub`);
    await writeFile(book, "from the library");
    try {
      expect(await copyToDevice(drive, book, "Dune - Frank Herbert.epub")).toBe(16);
      expect(existsSync(join(drive, "Dune - Frank Herbert.epub"))).toBe(true);
      expect(existsSync(join(drive, "documents"))).toBe(false);
    } finally {
      await rm(book, { force: true });
    }
  });

  it("takes off only books, never its own files or anything outside it", async () => {
    await writeFile(join(drive, "..", "outside.epub"), "not on it").catch(() => {});
    const freed = await removeFromDevice(drive, ["Dracula - Bram Stoker.epub", ".kobo/KoboReader.sqlite", "Digital Editions/library-loan.epub", "../outside.epub", "Classics/cover.jpg"]);
    expect(freed).toBe(6);
    expect(existsSync(join(drive, "Dracula - Bram Stoker.epub"))).toBe(false);
    expect(existsSync(join(drive, ".kobo", "KoboReader.sqlite"))).toBe(true);
    expect(existsSync(join(drive, "Digital Editions", "library-loan.epub"))).toBe(true);
    expect(existsSync(join(drive, "..", "outside.epub"))).toBe(true);
    expect(existsSync(join(drive, "Classics", "cover.jpg"))).toBe(true);
    await rm(join(drive, "..", "outside.epub"), { force: true });
  });

  it("hands over its books where they are, and says plainly when one isn't there", async () => {
    expect(await filesFromDevice(drive, ["Classics/Austen/Emma - Jane Austen.epub"])).toEqual({ paths: [join(drive, "Classics", "Austen", "Emma - Jane Austen.epub")], temporary: false });
    await expect(filesFromDevice(drive, [".kobo/KoboReader.sqlite"])).rejects.toThrow("isn't on your e-reader");
    await expect(filesFromDevice(drive, ["../../etc/hosts.epub"])).rejects.toThrow("isn't on your e-reader");
  });

  // A path not seen yet asks the system for its drives, which on Windows is PowerShell, and slow.
  it("is plugged in while it's seen, and a folder beside it isn't", async () => {
    expect(await isPluggedIn(drive)).toBe(true);
    expect(await isPluggedIn(join(drive, "Classics"))).toBe(false);
  }, 30_000);
});

describe("a PocketBook plugged in as a drive", () => {
  beforeEach(async () => {
    await put("system/config/global.cfg", "settings");
    await put("system/dictionaries/en.dic", "a dictionary");
    await put("Screenshots/scr0001.png", "a picture");
    await put("Books/Anna Karenina - Leo Tolstoy.fb2");
    await put("War and Peace.mobi");
    asIfPlugged([{ name: "PocketBook", path: drive, free: 1, kind: "pocketbook" }]);
  });

  it("lists its books, not its system folder", async () => {
    expect((await deviceFiles(drive)).map((f) => f.path).sort()).toEqual(["Books/Anna Karenina - Leo Tolstoy.fb2", "War and Peace.mobi"]);
  });

  it("never takes anything off its system folder", async () => {
    await put("system/trap.epub");
    expect(await removeFromDevice(drive, ["system/trap.epub", "War and Peace.mobi"])).toBe(6);
    expect(existsSync(join(drive, "system", "trap.epub"))).toBe(true);
  });
});

describe("what each e-reader reads", () => {
  it("starts with EPUB, which both read as it is", () => {
    for (const reader of Object.values(READERS)) expect(reader.reads[0]).toBe("epub");
  });

  it("keeps their own folders their own", () => {
    expect(READERS.kobo.own.test(".kobo")).toBe(true);
    expect(READERS.kobo.own.test("Digital Editions")).toBe(true);
    expect(READERS.kobo.own.test("Books")).toBe(false);
    expect(READERS.pocketbook.own.test("system")).toBe(true);
    expect(READERS.pocketbook.own.test("systematic")).toBe(false);
  });
});

describe("which of a book's files goes to an e-reader", () => {
  const { kobo, pocketbook } = READERS;

  it.each([
    // [formats, can make an EPUB, to a Kobo, to a PocketBook]
    [["epub"], true, { ext: "epub", convert: false }, { ext: "epub", convert: false }],
    [["mobi"], true, { ext: "epub", convert: true }, { ext: "mobi", convert: false }],
    [["fb2"], true, { ext: "epub", convert: true }, { ext: "fb2", convert: false }],
    [["txt"], true, { ext: "epub", convert: true }, { ext: "txt", convert: false }],
    [["azw3", "epub"], true, { ext: "epub", convert: false }, { ext: "epub", convert: false }],
    [["cbz"], true, { ext: "cbz", convert: false }, { ext: "cbz", convert: false }],
    // A PDF with nothing that reflows goes as it is; with something that does, an EPUB is better.
    [["pdf"], false, { ext: "pdf", convert: false }, { ext: "pdf", convert: false }],
    [["pdf", "docx"], true, { ext: "epub", convert: true }, { ext: "docx", convert: false }],
    // When nothing can be made, a PDF it reads still goes.
    [["pdf", "md"], false, { ext: "pdf", convert: false }, { ext: "pdf", convert: false }],
  ])("%j (EPUB possible: %s)", (formats, canMake, toKobo, toPocketBook) => {
    expect(readerFile(formats, kobo, canMake)).toEqual(toKobo);
    expect(readerFile(formats, pocketbook, canMake)).toEqual(toPocketBook);
  });

  it("gives nothing when there's nothing it reads and nothing to make", () => {
    expect(readerFile(["md"], kobo, false)).toBeNull();
    expect(readerFile([], pocketbook, false)).toBeNull();
  });

  it("never sends a Kobo anything but EPUB, comics or PDF", () => {
    for (const formats of [["mobi"], ["txt"], ["html"], ["fb2"], ["docx"], ["azw3"]]) {
      const plan = readerFile(formats, kobo, true);
      expect(plan?.ext).toBe("epub");
      expect(plan?.convert).toBe(true);
    }
  });
});

describe("a Kobo's books in hidden places", () => {
  beforeEach(async () => {
    await put(".kobo/x");
    await put("Books/.cache/hidden.epub");
    await put("Books/.Trashes/gone.epub");
    await put("Books/Visible.epub");
    asIfPlugged([{ name: "KOBOeReader", path: drive, free: 1, kind: "kobo" }]);
  });

  it("aren't listed, at any depth", async () => {
    expect((await deviceFiles(drive)).map((f) => f.path)).toEqual(["Books/Visible.epub"]);
  });

  it("aren't taken off or handed over, even when asked by name", async () => {
    expect(await removeFromDevice(drive, ["Books/.cache/hidden.epub", "Books/.Trashes/gone.epub"])).toBe(0);
    expect(existsSync(join(drive, "Books", ".cache", "hidden.epub"))).toBe(true);
    await expect(filesFromDevice(drive, ["Books/.cache/hidden.epub"])).rejects.toThrow("isn't on your e-reader");
    expect(await removeFromDevice(drive, ["Books/Visible.epub"])).toBe(6);
  });
});

describe("an e-reader that's gone", () => {
  it("isn't plugged in once it's no longer seen", async () => {
    asIfPlugged([]);
    expect(await isPluggedIn(drive)).toBe(false);
  });
});
