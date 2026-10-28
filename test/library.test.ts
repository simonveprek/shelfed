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
  });

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
