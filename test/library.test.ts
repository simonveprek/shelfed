import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../src/shared/types";

// Books removed go to the system Trash in the app; here they just go.
vi.mock("electron", () => ({ shell: { trashItem: (path: string) => rm(path, { recursive: true, force: true }) } }));

const { Library, safeName } = await import("../src/main/library");

let root: string;
let source: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "shelf-test-lib-"));
  source = await mkdtemp(join(tmpdir(), "shelf-test-src-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
  await rm(source, { recursive: true, force: true, maxRetries: 5 });
});

/** Files with different contents, ready to import. */
async function files(count: number, ext = "epub") {
  return Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const path = join(source, `book ${i}.${ext}`);
      await writeFile(path, `contents of book ${i}`);
      return path;
    }),
  );
}

describe("importing books", () => {
  it("keeps every file when many imports run at once", async () => {
    // Shelf imports a few books at a time, reads each one, then moves it out
    // of Incoming into Author/Title while the others are still copying.
    // Folders emptied behind one book must never take another's file with them.
    const lib = await new Library(root).open();
    const paths = await files(600);
    const queue = paths.map((path, i) => ({ path, i }));
    const books: Book[] = [];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { book } = await lib.importFile(next.path);
        // Reading the book's details takes a moment, different every time.
        await new Promise((r) => setTimeout(r, Math.random() * 3));
        books.push(await lib.update(book.id, { title: `Title ${next.i}`, authors: [`Author ${next.i % 7}`] }, true));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    expect(books).toHaveLength(600);
    const lost = books.filter((book) => !existsSync(lib.filePath(book)));
    expect(lost.map((b) => b.title)).toEqual([]);
    // Incoming is left empty, or gone.
    expect(existsSync(join(root, "Incoming")) ? await readdir(join(root, "Incoming")) : []).toEqual([]);
    await lib.flush();
    // Windows is slower with files, antivirus looking at each one, so this gets a minute there.
  }, 60_000);

  it("adds a file only once, even when it's added twice at the same moment", async () => {
    const lib = await new Library(root).open();
    const [path] = await files(1);
    const [a, b] = await Promise.all([lib.importFile(path), lib.importFile(path)]);
    expect(a.book.id).toBe(b.book.id);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect((await lib.importFile(path)).duplicate).toBe(true);
    expect(lib.list()).toHaveLength(1);
  });

  it("keeps two different books with the same title and author apart", async () => {
    const lib = await new Library(root).open();
    const paths = await files(2);
    const books = [];
    for (const path of paths) {
      const { book } = await lib.importFile(path);
      books.push(await lib.update(book.id, { title: "Poems", authors: ["Anonymous"] }, true));
    }
    expect(books[0].dir).not.toBe(books[1].dir);
    expect(readFileSync(lib.filePath(books[0]), "utf8")).toBe("contents of book 0");
    expect(readFileSync(lib.filePath(books[1]), "utf8")).toBe("contents of book 1");
  });

  it("stores folders with forward slashes, so a library moves between Mac and PC", async () => {
    const lib = await new Library(root).open();
    const [path] = await files(1);
    const { book } = await lib.importFile(path);
    expect(book.dir).toMatch(/^Incoming\/[^\\]+$/);
    const placed = await lib.update(book.id, { title: "T", authors: ["A"] }, true);
    expect(placed.dir).toMatch(/^A\/T \(\w{4}\)$/);
  });

  it("passes over folders it isn't allowed to read", async () => {
    const lib = await new Library(root).open();
    await files(1);
    const locked = join(source, "System Volume Information");
    await mkdir(locked);
    await writeFile(join(locked, "hidden.epub"), "x");
    expect((await lib.collect([source])).map((p) => basename(p))).toEqual(["book 0.epub"]);
  });

  it("tidies away folders left with only system files in them", async () => {
    const lib = await new Library(root).open();
    const [path] = await files(1);
    const { book } = await lib.importFile(path);
    await lib.update(book.id, { title: "T", authors: ["First"] }, true);
    await writeFile(join(root, "First", "Thumbs.db"), "x");
    await writeFile(join(root, "First", "desktop.ini"), "x");
    await lib.update(book.id, { authors: ["Second"] }, true);
    expect(existsSync(join(root, "First"))).toBe(false);
    expect(existsSync(lib.filePath(lib.get(book.id)))).toBe(true);
  });

  it("only takes files it can read", async () => {
    const lib = await new Library(root).open();
    await files(2, "epub");
    await files(1, "exe");
    await writeFile(join(source, "._book 0.epub"), "mac metadata");
    expect((await lib.collect([source])).map((p) => basename(p)).sort()).toEqual(["book 0.epub", "book 1.epub"]);
  });
});

describe("the library file", () => {
  it("comes back the same after a restart", async () => {
    const lib = await new Library(root).open();
    const [path] = await files(1);
    const { book } = await lib.importFile(path);
    await lib.update(book.id, { title: "Kept", authors: ["Someone"], rating: 4 }, true);
    await lib.flush();
    const again = await new Library(root).open();
    expect(again.get(book.id)).toMatchObject({ title: "Kept", authors: ["Someone"], rating: 4 });
  });

  it("sets a broken file aside and starts from the backup", async () => {
    const lib = await new Library(root).open();
    const [path] = await files(1);
    const { book } = await lib.importFile(path);
    await lib.flush();
    await writeFile(join(root, "library.backup.json"), readFileSync(join(root, "library.json")));
    await writeFile(join(root, "library.json"), "{ half a file");
    const again = await new Library(root).open();
    expect(again.get(book.id).id).toBe(book.id);
    const names = await readdir(root);
    expect(names.some((n) => n.startsWith("library.json.broken-"))).toBe(true);
  });

  it("remembers when a book was finished, and forgets it when it's started again", async () => {
    const lib = await new Library(root).open();
    const [path] = await files(1);
    const { book } = await lib.importFile(path);
    expect((await lib.update(book.id, { status: "finished" })).finishedAt).toBeTypeOf("number");
    expect((await lib.update(book.id, { status: "reading" })).finishedAt).toBeUndefined();
  });
});

describe("removing books", () => {
  it("hides them at once, can undo, and only then deletes the folder", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const lib = await new Library(root).open();
      const paths = await files(2);
      const [a, b] = await Promise.all(paths.map(async (p) => (await lib.importFile(p)).book));
      lib.remove([a.id, b.id], 1000);
      expect(lib.list()).toHaveLength(0);
      lib.restore([b.id]);
      expect(lib.list().map((x) => x.id)).toEqual([b.id]);
      expect(existsSync(lib.bookDir(a))).toBe(true);
      await lib.settle();
      expect(existsSync(lib.bookDir(a))).toBe(false);
      expect(existsSync(lib.filePath(b))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("file names", () => {
  it("are safe on Windows and macOS", () => {
    expect(safeName('What? A "Book": Part 1/2 <draft>|')).toBe("What A Book Part 12 draft");
    expect(safeName("Trailing dots... ")).toBe("Trailing dots");
    expect(safeName("   ")).toBe("Unknown");
    expect(safeName("x".repeat(200), 80)).toHaveLength(80);
  });

  it("never end in a dot or space, even when cut short", () => {
    expect(safeName("A".repeat(9) + ". Next", 10)).toBe("AAAAAAAAA");
    expect(safeName("Title ...", 7)).toBe("Title");
  });

  it("step around the names Windows keeps for devices", () => {
    expect(safeName("Con")).toBe("Con_");
    expect(safeName("aux.epub")).toBe("aux.epub_");
    expect(safeName("COM1")).toBe("COM1_");
    expect(safeName("Conrad")).toBe("Conrad");
  });
});

describe("authors' names", () => {
  it("are turned round when a book's details come in", async () => {
    const lib = await new Library(root).open();
    const [path] = await files(1);
    const { book } = await lib.importFile(path);
    const named = await lib.update(book.id, { title: "Halt's Peril", authors: ["Flanagan, John"] }, true);
    expect(named.authors).toEqual(["John Flanagan"]);
    expect(named.dir.startsWith("John Flanagan/")).toBe(true);
    await lib.flush();
  });

  it("are put right in a library saved before, folders and all", async () => {
    // A library from before names were turned round, with its book in "Flanagan, John".
    const lib = await new Library(root).open();
    const [path] = await files(1);
    const { book } = await lib.importFile(path);
    await lib.update(book.id, { title: "Halt's Peril" }, true);
    await lib.flush();
    const db = join(root, "library.json");
    const data = JSON.parse(readFileSync(db, "utf8"));
    const old = data.books[0];
    await mkdir(join(root, "Flanagan, John"), { recursive: true });
    const { rename } = await import("node:fs/promises");
    await rename(join(root, old.dir), join(root, "Flanagan, John", basename(old.dir)));
    old.dir = `Flanagan, John/${basename(old.dir)}`;
    old.authors = ["Flanagan, John"];
    await writeFile(db, JSON.stringify(data));

    const again = await new Library(root).open();
    const fixed = again.get(old.id);
    expect(fixed.authors).toEqual(["John Flanagan"]);
    expect(fixed.dir.startsWith("John Flanagan/")).toBe(true);
    expect(existsSync(again.filePath(fixed))).toBe(true);
    expect(existsSync(join(root, "Flanagan, John"))).toBe(false);
    await again.flush();
  });
});

describe("a book in several formats", () => {
  /** A Calibre library: Author/Title (id)/ with every format, the cover and metadata.opf. */
  async function calibre() {
    const book = join(source, "John Flanagan", "The Ruins of Gorlan (12)");
    await mkdir(book, { recursive: true });
    for (const ext of ["mobi", "epub", "azw3"]) await writeFile(join(book, `The Ruins of Gorlan - John Flanagan.${ext}`), `gorlan as ${ext}`);
    await writeFile(join(book, "metadata.opf"), "<package/>");
    await writeFile(join(book, "cover.jpg"), "a cover");
    const other = join(source, "Jane Austen", "Emma (13)");
    await mkdir(other, { recursive: true });
    await writeFile(join(other, "Emma - Jane Austen.epub"), "emma");
    await writeFile(join(other, "metadata.opf"), "<package/>");
    await writeFile(join(source, "metadata.db"), "calibre's database");
    return book;
  }

  it("collects a Calibre book's formats as one book, the EPUB first", async () => {
    await calibre();
    const lib = await new Library(root).open();
    const books = await lib.collectBooks([source]);
    expect(books).toHaveLength(2);
    const gorlan = books.find((files) => files.length === 3)!;
    expect(gorlan.map((file) => basename(file))).toEqual([
      "The Ruins of Gorlan - John Flanagan.epub",
      "The Ruins of Gorlan - John Flanagan.azw3",
      "The Ruins of Gorlan - John Flanagan.mobi",
    ]);
  });

  it("collects files sharing a name in one folder as one book, and different names apart", async () => {
    for (const name of ["Emma.epub", "Emma.MOBI", "Persuasion.epub"]) await writeFile(join(source, name), name);
    const lib = await new Library(root).open();
    const books = (await lib.collectBooks([source])).map((files) => files.map((file) => basename(file)));
    expect(books).toHaveLength(2);
    expect(books).toContainEqual(["Emma.epub", "Emma.MOBI"]);
    expect(books).toContainEqual(["Persuasion.epub"]);
  });

  it("adds the other formats to the book", async () => {
    await calibre();
    const lib = await new Library(root).open();
    const [first, ...others] = (await lib.collectBooks([source])).find((files) => files.length === 3)!;
    const { book } = await lib.importFile(first);
    for (const other of others) await lib.joinFile(book.id, other);
    expect(lib.list()).toHaveLength(1);
    expect(lib.get(book.id).formats.map((f) => f.ext).sort()).toEqual(["azw3", "epub", "mobi"]);
    for (const format of lib.get(book.id).formats) expect(existsSync(join(lib.bookDir(lib.get(book.id)), format.file))).toBe(true);
  });

  it("folds a format that came in before as a book of its own into its book", async () => {
    await calibre();
    const lib = await new Library(root).open();
    const [first, ...others] = (await lib.collectBooks([source])).find((files) => files.length === 3)!;
    // How it went before: every file a book.
    for (const file of [first, ...others]) await lib.importFile(file);
    expect(lib.list()).toHaveLength(3);
    // Brought in again, the copies join the first.
    const { book, duplicate } = await lib.importFile(first);
    expect(duplicate).toBe(true);
    const folded: string[] = [];
    for (const other of others) {
      const result = await lib.joinFile(book.id, other);
      if (result.folded) folded.push(result.folded);
    }
    expect(folded).toHaveLength(2);
    expect(lib.list()).toHaveLength(1);
    expect(lib.get(book.id).formats.map((f) => f.ext).sort()).toEqual(["azw3", "epub", "mobi"]);
    // And again changes nothing.
    for (const other of others) expect((await lib.joinFile(book.id, other)).folded).toBeUndefined();
    expect(lib.get(book.id).formats).toHaveLength(3);
  });

  it("reads Calibre's details and cover beside a book, and nothing else", async () => {
    const dir = await calibre();
    const lib = await new Library(root).open();
    const side = await lib.sidecar(join(dir, "The Ruins of Gorlan - John Flanagan.epub"));
    expect(side.opf).toBe("<package/>");
    expect(Buffer.from(side.cover!).toString()).toBe("a cover");
    expect(await lib.sidecar(join(dir, "metadata.opf"))).toEqual({});
    expect(await lib.sidecar(join(source, "loose.epub"))).toEqual({});
  });
});

describe("sending a folder to the Trash", () => {
  it("never takes a folder another book is in", async () => {
    const lib = await new Library(root).open();
    const [a, b] = await files(2);
    const one = (await lib.importFile(a)).book;
    const two = (await lib.importFile(b)).book;
    // A broken entry pointing at the library itself, or at a folder holding another book.
    for (const dir of ["", ".", "..", two.dir.split("/")[0]]) {
      one.dir = dir;
      await expect(lib.merge(one.id, two.id)).rejects.toThrow();
      expect(existsSync(lib.filePath(two))).toBe(true);
    }
  });

  it("keeps the folder when removing a book whose folder isn't its own", async () => {
    const lib = await new Library(root).open();
    const [a, b] = await files(2);
    const one = (await lib.importFile(a)).book;
    const two = (await lib.importFile(b)).book;
    one.dir = "";
    lib.remove([one.id], 0);
    await lib.settle();
    expect(lib.list().map((x) => x.id)).toEqual([two.id]);
    expect(existsSync(lib.filePath(two))).toBe(true);
  });
});

describe("a series kept in the title", () => {
  it("becomes the book's series when the library opens, and the folder its clean title", async () => {
    const lib = await new Library(root).open();
    const [path] = await files(1);
    const { book } = await lib.importFile(path);
    await lib.update(book.id, { title: "The King of the West: (Path of the Ranger Book 7)", authors: ["Pedro Urvi"] }, true);
    lib.flushNow();
    const again = await new Library(root).open();
    const fixed = again.get(book.id);
    expect(fixed).toMatchObject({ title: "The King of the West", series: "Path of the Ranger", seriesIndex: 7 });
    expect(fixed.dir).toMatch(/^Pedro Urvi\/The King of the West \(/);
    expect(existsSync(again.filePath(fixed))).toBe(true);
  });
});

