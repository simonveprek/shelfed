import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  asIfFound, crossPointClippings, crossPointCopy, crossPointFetch, crossPointFiles, crossPointRemove, forgetReaders, isAddress, isFound,
  lookForReaders, parseHello, wifiReaders,
} from "../src/main/crosspoint";
import { readerFile, READERS } from "../src/shared/ereaders";
import { pretendCrossPoint, type PretendCrossPoint } from "./pretend-crosspoint";

/*
 * Sending books to a CrossPoint reader over Wi-Fi, against a pretend one that
 * answers as the real one's web server does.
 */

process.env.SHELF_NO_HELLO = "1";

let reader: PretendCrossPoint | null = null;
afterEach(async () => {
  await reader?.close();
  reader = null;
  forgetReaders();
});

const at = (r: PretendCrossPoint) => `crosspoint://${r.host}`;

describe("finding a CrossPoint reader", () => {
  it("knows its answer to hello, and nothing else", () => {
    expect(parseHello("crosspoint (on CrossPoint-Reader);81")).toEqual({ name: "CrossPoint-Reader" });
    expect(parseHello("crosspoint (on reader);81\n")).toEqual({ name: "reader" });
    expect(parseHello("koreader (on x);81")).toBeNull();
    expect(parseHello("crosspoint (on x)")).toBeNull();
  });

  it("only takes addresses that are a name or an IP, with a port", () => {
    for (const ok of ["192.168.1.40", "crosspoint.local", "reader", "127.0.0.1:8080"]) expect(isAddress(ok), ok).toBe(true);
    for (const bad of ["http://192.168.1.40", "192.168.1.40/upload", "a b", "evil.com@192.168.1.1", "../x", "", "[::1]"]) expect(isAddress(bad), bad).toBe(false);
  });

  it("finds one at an address given, says what model it is, and forgets it when told", async () => {
    reader = await pretendCrossPoint({}, "X3");
    await lookForReaders(reader.host);
    expect(wifiReaders()).toEqual([{ name: "Xteink X3", path: at(reader), free: 0, kind: "crosspoint" }]);
    expect(isFound(at(reader))).toBe(true);
    forgetReaders();
    expect(wifiReaders()).toEqual([]);
    expect(isFound(at(reader))).toBe(false);
  });

  it("doesn't take something else answering at that address for one", async () => {
    const { createServer } = await import("node:http");
    const other = createServer((_, res) => res.end(JSON.stringify({ firmwareFamily: "something-else" })));
    await new Promise<void>((done) => other.listen(0, "127.0.0.1", done));
    const port = (other.address() as { port: number }).port;
    await lookForReaders(`127.0.0.1:${port}`);
    expect(wifiReaders()).toEqual([]);
    await new Promise((done) => other.close(done));
  });
});

describe("books on a CrossPoint reader", () => {
  it("lists them, a few folders deep, leaving out its own folders, hidden files and what isn't a book", async () => {
    reader = await pretendCrossPoint({
      "/Books/Emma.epub": "emma",
      "/Books/Classics/Persuasion.epub": "persuasion",
      "/notes.txt": "a note",
      "/My Clippings.txt": "clips",
      "/sleep.bmp": "picture",
      "/XTCache/emma.xtc": "cache",
      "/.crosspoint/wifi.json": "{}",
      "/.hidden.epub": "hidden",
    });
    const files = await crossPointFiles(at(reader));
    expect(files.map((f) => f.path).sort()).toEqual(["Books/Classics/Persuasion.epub", "Books/Emma.epub", "My Clippings.txt", "notes.txt"].sort());
    expect(files.find((f) => f.name === "Emma.epub")?.size).toBe(4);
  });

  it("sends one into Books, making the folder the first time, and replaces one of the same name", async () => {
    reader = await pretendCrossPoint();
    const dir = mkdtempSync(join(tmpdir(), "shelf-cp-"));
    const book = join(dir, "Emma.epub");
    writeFileSync(book, Buffer.alloc(200_000, 7));
    const seen: number[] = [];
    expect(await crossPointCopy(at(reader), book, "Emma - Jane Austen.epub", (f) => seen.push(f))).toBe(200_000);
    expect(reader.card.get("/Books/Emma - Jane Austen.epub")?.length).toBe(200_000);
    expect(seen.at(-1)).toBe(1);
    expect(seen.length).toBeGreaterThan(2);
    writeFileSync(book, "shorter");
    await crossPointCopy(at(reader), book, "Emma - Jane Austen.epub");
    expect(reader.card.get("/Books/Emma - Jane Austen.epub")?.toString()).toBe("shorter");
  });

  it("won't send a file under a name that climbs out of its folder", async () => {
    reader = await pretendCrossPoint();
    const book = join(mkdtempSync(join(tmpdir(), "shelf-cp-")), "x.epub");
    writeFileSync(book, "x");
    await expect(crossPointCopy(at(reader), book, "../x.epub")).rejects.toThrow();
    await expect(crossPointCopy("crosspoint://evil.com/upload?x=", book, "x.epub")).rejects.toThrow();
  });

  it("takes books off, only ones it listed, never its own files, and says how much that freed", async () => {
    reader = await pretendCrossPoint({ "/Books/Emma.epub": "emma", "/Books/Persuasion.epub": "persuasion", "/.crosspoint/wifi.json": "{}" });
    expect(await crossPointRemove(at(reader), ["Books/Emma.epub", ".crosspoint/wifi.json", "Books/Nowhere.epub"])).toBe(4);
    expect(reader.card.has("/Books/Emma.epub")).toBe(false);
    expect(reader.card.has("/Books/Persuasion.epub")).toBe(true);
    expect(reader.card.has("/.crosspoint/wifi.json")).toBe(true);
  });

  it("copies books off into a folder of their own, to bring them in", async () => {
    reader = await pretendCrossPoint({ "/Books/Emma.epub": "emma" });
    const [path] = await crossPointFetch(at(reader), ["Books/Emma.epub"]);
    expect(readFileSync(path, "utf8")).toBe("emma");
    await expect(crossPointFetch(at(reader), [".crosspoint/wifi.json"])).rejects.toThrow();
  });

  it("brings its highlights, from its My Clippings file", async () => {
    reader = await pretendCrossPoint({ "/My Clippings.txt": "Emma (Jane Austen)\n- Your Highlight\n\nIt is a truth\n==========\n" });
    asIfFound(reader.host, "Xteink X4");
    expect(await crossPointClippings()).toEqual([{ device: "Xteink X4", text: "Emma (Jane Austen)\n- Your Highlight\n\nIt is a truth\n==========\n" }]);
  });

  it("says in plain words when the reader stopped answering", async () => {
    reader = await pretendCrossPoint();
    const host = reader.host;
    await reader.close();
    reader = null;
    await expect(crossPointFiles(`crosspoint://${host}`)).rejects.toThrow(/stopped answering/);
  });
});

describe("what goes to a CrossPoint reader", () => {
  it("is an EPUB, made from anything that reflows, since it reads little else", () => {
    expect(readerFile(["epub", "pdf"], READERS.crosspoint, true)).toEqual({ ext: "epub", convert: false });
    expect(readerFile(["mobi"], READERS.crosspoint, true)).toEqual({ ext: "epub", convert: true });
    expect(readerFile(["pdf"], READERS.crosspoint, false)).toBeNull();
    expect(readerFile(["txt"], READERS.crosspoint, true)).toEqual({ ext: "txt", convert: false });
  });
});
