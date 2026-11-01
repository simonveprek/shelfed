import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Incomplete, MtpKindle, NoRoom, TooBig, type Backend, type Entry } from "../src/main/mtp/kindle";
import { PretendKindle, type Quirks } from "../src/main/mtp/pretend";
import { encodeObjectInfo, encodeString, FORMAT_FOLDER, type MtpError, OP, parseObjectInfo, Reader } from "../src/main/mtp/protocol";
import { SessionBackend } from "../src/main/mtp/session-backend";

let dir: string;
let kindleRoot: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shelf-mtp-"));
  kindleRoot = join(dir, "kindle");
  mkdirSync(join(kindleRoot, "documents"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const connect = async (quirks: Quirks = {}) => {
  const device = new PretendKindle(kindleRoot, quirks);
  let closed = false;
  const { backend, info } = await SessionBackend.start(device, async () => {
    closed = true;
  });
  return { device, info, kindle: new MtpKindle(backend), backend, closed: () => closed };
};

const book = (name: string, bytes: Buffer | string) => {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
};

/** A MOBI's first bytes, as far as anyone needs to tell if it's locked. */
const mobi = (encryption: number) => {
  const out = Buffer.alloc(200);
  out.write("BOOKMOBI", 60, "latin1");
  out.writeUInt32BE(100, 78);
  out.writeUInt16BE(encryption, 112);
  return out;
};

describe("MTP's own way of writing things", () => {
  it("writes a string with its count and ending, and reads it back", () => {
    const bytes = encodeString("Příliš žluťoučký");
    expect(bytes[0]).toBe("Příliš žluťoučký".length + 1);
    expect(new Reader(bytes).string()).toBe("Příliš žluťoučký");
    expect(encodeString("")).toEqual(Buffer.from([0]));
  });

  it("never writes a name too long for its one-byte count", () => {
    expect(encodeString("x".repeat(400))[0]).toBe(255);
  });

  it("describes a file so that it reads back the same", () => {
    const info = parseObjectInfo(encodeObjectInfo({ storage: 0x10001, parent: 7, format: FORMAT_FOLDER, size: 123, name: "Dune.azw3" }));
    expect(info).toEqual({ storage: 0x10001, parent: 7, format: FORMAT_FOLDER, size: 123, name: "Dune.azw3" });
  });

  it("doesn't run off the end of a short answer", () => {
    const r = new Reader(Buffer.from([1]));
    expect(r.u32()).toBe(0);
    expect(r.u64()).toBe(0);
    expect(r.string()).toBe("");
    expect(r.u32s()).toEqual([]);
  });
});

describe("a device that lies about its files", () => {
  const docs = () => join(kindleRoot, "documents");

  it("stops copying a file that goes on past the size it said, and keeps none of it", async () => {
    writeFileSync(join(docs(), "Big.epub"), Buffer.alloc(100_000, 1));
    const { kindle } = await connect({ claimsSize: 1000 });
    const target = join(dir, "out.epub");
    await expect(kindle.get("Big.epub", target)).rejects.toThrow("more of a file");
    expect(existsSync(target)).toBe(false);
  });

  it("keeps nothing of a file that comes up shorter than it said", async () => {
    writeFileSync(join(docs(), "Small.epub"), Buffer.alloc(100, 1));
    const { kindle } = await connect({ claimsSize: 5000 });
    const target = join(dir, "out.epub");
    await expect(kindle.get("Small.epub", target)).rejects.toBeInstanceOf(Incomplete);
    expect(existsSync(target)).toBe(false);
  });

  it("won't start copying a book too big to be real", async () => {
    writeFileSync(join(docs(), "Huge.epub"), "x");
    const { kindle, device } = await connect({ claimsSize: 3 * 1024 * 1024 * 1024 });
    const target = join(dir, "out.epub");
    await expect(kindle.get("Huge.epub", target)).rejects.toBeInstanceOf(TooBig);
    expect(device.log).not.toContain(OP.GetObject);
    expect(existsSync(target)).toBe(false);
  });

  it("holds a smaller limit when it's given one", async () => {
    writeFileSync(join(docs(), "My Clippings.txt"), Buffer.alloc(100));
    const { kindle } = await connect();
    await expect(kindle.get("My Clippings.txt", join(dir, "c.txt"), 50)).rejects.toBeInstanceOf(TooBig);
  });
});

/** A device with whatever folders a test wants, however unlikely. */
class Scripted implements Backend {
  removed: string[] = [];
  asked = 0;
  constructor(private list: (parent: string | null) => Entry[]) {}
  async storages() {
    return [{ id: "s", name: "x", capacity: 1, free: 1 }];
  }
  async children(_storage: string, parent: string | null) {
    this.asked++;
    return this.list(parent);
  }
  async makeFolder() {
    return "new";
  }
  async send() {
    return "sent";
  }
  async fetch() {}
  async read() {
    return null;
  }
  async remove(id: string) {
    this.removed.push(id);
  }
  async close() {}
}

const file = (name: string, id = name): Entry => ({ id, name, size: 5, folder: false });
const folder = (name: string, id = name): Entry => ({ id, name, size: 0, folder: true });

describe("a device with hostile names", () => {
  const inDocuments = (entries: Entry[]) => new Scripted((parent) => (parent === null ? [folder("documents", "docs")] : parent === "docs" ? entries : []));

  it.each(["..", ".", "../evil.azw3", "a/b.azw3", "a\\b.azw3", "bad\u0000.azw3", "line\nbreak.azw3", "gnp.\u202eevil.azw3", "\u2066hidden.azw3", "x".repeat(256) + ".azw3", ""])("doesn't list a file named %j", async (name) => {
    const kindle = new MtpKindle(inDocuments([file(name, "bad"), file("Fine.azw3")]));
    expect((await kindle.files()).map((f) => f.name)).toEqual(["Fine.azw3"]);
  });

  it("doesn't go into a folder with such a name", async () => {
    const backend = new Scripted((parent) => (parent === null ? [folder("documents", "docs")] : parent === "docs" ? [folder("..", "up"), folder("a/b", "slash")] : [file("Hidden.azw3")]));
    expect(await new MtpKindle(backend).files()).toEqual([]);
  });

  it("gets lost in no folder that contains itself", async () => {
    const backend = new Scripted((parent) => (parent === null ? [folder("documents", "docs")] : [folder("loop", "docs"), file("a.azw3")]));
    const files = await new MtpKindle(backend).files();
    expect(files.length).toBe(4);
    expect(backend.asked).toBeLessThan(10);
  });

  it("gives up on a device claiming an endless number of files", async () => {
    let made = 0;
    const backend = new Scripted((parent) => {
      if (parent === null) return [folder("documents", "docs")];
      return Array.from({ length: 1000 }, () => (made++ % 2 ? file(`${made}.azw3`) : folder(`${made}`)));
    });
    await new MtpKindle(backend).files();
    expect(made).toBeLessThan(200_000);
  }, 30_000);

  it("won't copy a book onto it under a name that isn't plain", async () => {
    const backend = inDocuments([]);
    await expect(new MtpKindle(backend).put(book("in.bin", "abc"), "../evil.azw3", 3)).rejects.toThrow("isn't a name");
  });
});

describe("telling files apart", () => {
  it("takes off the exact file asked for when another differs only in capitals", async () => {
    const backend = new Scripted((parent) => (parent === null ? [folder("documents", "docs")] : [file("DUNE.azw3", "upper"), file("Dune.azw3", "exact")]));
    await new MtpKindle(backend).remove(["Dune.azw3"]);
    expect(backend.removed).toEqual(["exact"]);
  });

  it("still finds one that differs only in capitals if that's all there is", async () => {
    const backend = new Scripted((parent) => (parent === null ? [folder("documents", "docs")] : [file("DUNE.azw3", "upper")]));
    await new MtpKindle(backend).remove(["Dune.azw3"]);
    expect(backend.removed).toEqual(["upper"]);
  });

  it.each(["Ｄune.azw3", "Dûne.azw3", "Dune\u200b.azw3"])("doesn't take %s for Dune.azw3", async (name) => {
    const backend = new Scripted((parent) => (parent === null ? [folder("documents", "docs")] : [file(name, "lookalike")]));
    await new MtpKindle(backend).remove(["Dune.azw3"]);
    expect(backend.removed).toEqual([]);
  });

  it("takes only the notes folder of the book it took off", async () => {
    const backend = new Scripted((parent) => (parent === null ? [folder("documents", "docs")] : [file("Dune.azw3", "book"), folder("Dune.sdr", "notes"), folder("Dune Messiah.sdr", "other")]));
    await new MtpKindle(backend).remove(["Dune.azw3"]);
    expect(backend.removed).toEqual(["book", "notes"]);
  });
});

describe("a Kindle over MTP", () => {
  it("opens a session, and says who it is and how much room it has", async () => {
    const { info, kindle, device } = await connect();
    expect(info.manufacturer).toBe("Amazon");
    expect(device.sessions).toBe(1);
    const space = await kindle.space();
    expect(space.capacity).toBe(6_200_000_000);
    expect(space.free).toBe(6_200_000_000);
    expect(space.name).toBe("Internal Storage");
  });

  it("copies a book on, and it arrives whole", async () => {
    const { kindle } = await connect();
    const bytes = Buffer.alloc(300_000, 7);
    const seen: number[] = [];
    await kindle.put(book("Dune.azw3", bytes), "Dune.azw3", bytes.length, (done) => seen.push(done));
    expect(readFileSync(join(kindleRoot, "documents", "Dune.azw3")).equals(bytes)).toBe(true);
    expect(seen.at(-1)).toBe(bytes.length);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it.each([512, 1024, 64])("sends data sized to exactly fill packets of %i, ended properly", async (packetSize) => {
    const { kindle } = await connect({ packetSize });
    // With the 12 byte header the whole container fills its packets to the byte.
    const bytes = Buffer.alloc(packetSize * 40 - 12, 3);
    await kindle.put(book("exact.azw3", bytes), "exact.azw3", bytes.length);
    expect(readFileSync(join(kindleRoot, "documents", "exact.azw3")).length).toBe(bytes.length);
  });

  it("gives back the handle a new file really has, however the answer is split", async () => {
    const { backend } = await connect({ splitHeaders: true });
    const storage = (await backend.storages())[0].id;
    const docs = (await backend.children(storage, null)).find((e) => e.name === "documents")!;
    const id = await backend.send(storage, docs.id, "a.txt", book("a.txt", "abc"), 3);
    expect(Number(id)).toBeGreaterThan(0);
    expect((await backend.children(storage, docs.id)).map((e) => e.id)).toEqual([id]);
  });

  it("copies an empty file", async () => {
    const { kindle } = await connect();
    await kindle.put(book("empty.txt", ""), "empty.txt", 0);
    expect(readFileSync(join(kindleRoot, "documents", "empty.txt")).length).toBe(0);
  });

  it.each(["Žluťoučký kůň.azw3", "本.epub", "emoji 😀.pdf", "with 'quotes' & more.txt"])("keeps the name %s", async (name) => {
    const { kindle } = await connect();
    await kindle.put(book("in.bin", "abc"), name, 3);
    expect((await kindle.files()).map((f) => f.name)).toEqual([name]);
  });

  it("gets every size right around the edges of a packet, both ways, with every kind of device", async () => {
    for (const quirks of [{}, { splitHeaders: true }, { noEmptyPackets: true }, { packetSize: 64 }] as Quirks[]) {
      const { kindle, device } = await connect(quirks);
      for (const size of [1, 499, 500, 501, 511, 512, 513, 1012, 1023, 1024, 1036, 262_144, 262_156]) {
        const bytes = Buffer.alloc(size);
        for (let i = 0; i < size; i++) bytes[i] = (i * 31 + size) & 0xff;
        await kindle.put(book("edge.bin", bytes), "edge.azw3", size);
        expect(readFileSync(join(kindleRoot, "documents", "edge.azw3")).equals(bytes), `up, ${size}, ${device.packetSize}`).toBe(true);
        const back = join(dir, "back.bin");
        await kindle.get("edge.azw3", back);
        expect(readFileSync(back).equals(bytes), `down, ${size}, ${device.packetSize}`).toBe(true);
      }
      await kindle.close();
    }
  });

  it("sends the tiniest of files, with its header in the same packet", async () => {
    const { kindle } = await connect();
    await kindle.put(book("t.txt", "x"), "t.txt", 1);
    expect(readFileSync(join(kindleRoot, "documents", "t.txt"), "utf8")).toBe("x");
  });

  it("makes the documents folder on a Kindle that has none", async () => {
    rmSync(join(kindleRoot, "documents"), { recursive: true });
    const { kindle } = await connect();
    expect(await kindle.files()).toEqual([]);
    await kindle.put(book("a.azw3", "abc"), "a.azw3", 3);
    expect(existsSync(join(kindleRoot, "documents", "a.azw3"))).toBe(true);
  });

  it("finds a documents folder however it's capitalised", async () => {
    rmSync(join(kindleRoot, "documents"), { recursive: true });
    mkdirSync(join(kindleRoot, "Documents"));
    writeFileSync(join(kindleRoot, "Documents", "a.azw3"), "abc");
    const { kindle } = await connect();
    expect((await kindle.files()).map((f) => f.path)).toEqual(["a.azw3"]);
  });

  it("replaces a book of the same name rather than keeping two", async () => {
    const { kindle } = await connect();
    await kindle.put(book("Dune.azw3", "old"), "Dune.azw3", 3);
    await kindle.put(book("Dune2.azw3", "newer"), "Dune.azw3", 5);
    expect(readFileSync(join(kindleRoot, "documents", "Dune.azw3"), "utf8")).toBe("newer");
    expect((await kindle.files()).length).toBe(1);
  });

  it("lists book files a few folders deep, not notes, dictionaries' insides or clippings", async () => {
    const docs = join(kindleRoot, "documents");
    mkdirSync(join(docs, "Dune.sdr"));
    writeFileSync(join(docs, "Dune.sdr", "notes.azw3"), "n");
    mkdirSync(join(docs, "a", "b"), { recursive: true });
    writeFileSync(join(docs, "a", "b", "Deep.epub"), "deep");
    writeFileSync(join(docs, "Dune.azw3"), "dune");
    writeFileSync(join(docs, "My Clippings.txt"), "clips");
    writeFileSync(join(docs, "picture.png"), "png");
    const { kindle } = await connect();
    expect((await kindle.files()).map((f) => f.path).sort()).toEqual(["Dune.azw3", "a/b/Deep.epub"]);
  });

  it("tells which books are locked, by looking inside them", async () => {
    const docs = join(kindleRoot, "documents");
    writeFileSync(join(docs, "Open.azw3"), mobi(0));
    writeFileSync(join(docs, "Bought.azw"), mobi(2));
    writeFileSync(join(docs, "Store.kfx"), "kfx");
    writeFileSync(join(docs, "Plain.pdf"), "pdf");
    const { kindle } = await connect();
    const files = await kindle.files();
    const locked = Object.fromEntries(files.map((f) => [f.name, Boolean(f.locked)]));
    expect(locked).toEqual({ "Open.azw3": false, "Bought.azw": true, "Store.kfx": true, "Plain.pdf": false });
  });

  it("goes by the name a delivered book has when a device can't read part of a file", async () => {
    const docs = join(kindleRoot, "documents");
    writeFileSync(join(docs, "Mine-partial.azw3"), "aaaaa");
    writeFileSync(join(docs, "Theirs-partial_B000ABC_EBOK.azw"), "bbbbb");
    const { kindle } = await connect({ noPartial: true });
    const locked = Object.fromEntries((await kindle.files()).map((f) => [f.name, Boolean(f.locked)]));
    expect(locked).toEqual({ "Mine-partial.azw3": false, "Theirs-partial_B000ABC_EBOK.azw": true });
  });

  it("copies a book off to this computer", async () => {
    const bytes = Buffer.alloc(100_000, 9);
    mkdirSync(join(kindleRoot, "documents", "sub"));
    writeFileSync(join(kindleRoot, "documents", "sub", "Mine.epub"), bytes);
    const { kindle } = await connect();
    const target = join(dir, "out.epub");
    await kindle.get("sub/Mine.epub", target);
    expect(readFileSync(target).equals(bytes)).toBe(true);
  });

  it("takes a book off with its notes, and says how much came free", async () => {
    const docs = join(kindleRoot, "documents");
    writeFileSync(join(docs, "Dune.azw3"), "12345");
    mkdirSync(join(docs, "Dune.sdr"));
    writeFileSync(join(docs, "Dune.sdr", "x"), "n");
    writeFileSync(join(docs, "Keep.azw3"), "keep");
    const { kindle } = await connect();
    expect(await kindle.remove(["Dune.azw3"])).toBe(5);
    expect(existsSync(join(docs, "Dune.azw3"))).toBe(false);
    expect(existsSync(join(docs, "Dune.sdr"))).toBe(false);
    expect(existsSync(join(docs, "Keep.azw3"))).toBe(true);
  });

  it("takes a book off from inside a folder, with its notes there", async () => {
    const docs = join(kindleRoot, "documents");
    mkdirSync(join(docs, "a", "b", "Deep.sdr"), { recursive: true });
    writeFileSync(join(docs, "a", "b", "Deep.epub"), "123");
    writeFileSync(join(docs, "a", "Deep.epub"), "other");
    const { kindle } = await connect();
    expect(await kindle.remove(["a/b/Deep.epub"])).toBe(3);
    expect(existsSync(join(docs, "a", "b", "Deep.epub"))).toBe(false);
    expect(existsSync(join(docs, "a", "b", "Deep.sdr"))).toBe(false);
    expect(existsSync(join(docs, "a", "Deep.epub"))).toBe(true);
  });

  it("lists a big library correctly, in folders and all", async () => {
    const docs = join(kindleRoot, "documents");
    for (let shelf = 0; shelf < 20; shelf++) {
      mkdirSync(join(docs, `shelf ${shelf}`));
      for (let n = 0; n < 150; n++) writeFileSync(join(docs, `shelf ${shelf}`, `Book ${n}.azw3`), mobi(0));
    }
    const { kindle } = await connect();
    const files = await kindle.files();
    expect(files.length).toBe(3000);
    expect(new Set(files.map((f) => f.path)).size).toBe(3000);
    expect(files.every((f) => f.size === 200 && !f.locked)).toBe(true);
  }, 60_000);

  it("won't reach outside documents, or take anything that isn't a book", async () => {
    mkdirSync(join(kindleRoot, "system"));
    writeFileSync(join(kindleRoot, "system", "vital.txt"), "vital");
    const docs = join(kindleRoot, "documents");
    writeFileSync(join(docs, "My Clippings.txt"), "clips");
    writeFileSync(join(docs, "secret.dat"), "data");
    const { kindle } = await connect();
    expect(await kindle.remove(["../system/vital.txt", "My Clippings.txt", "secret.dat", "Nothing.azw3"])).toBe(0);
    expect(existsSync(join(kindleRoot, "system", "vital.txt"))).toBe(true);
    expect(existsSync(join(docs, "My Clippings.txt"))).toBe(true);
    expect(existsSync(join(docs, "secret.dat"))).toBe(true);
  });

  it("says when a book won't fit, before sending any of it", async () => {
    const { kindle, device } = await connect({ capacity: 1000 });
    const bytes = Buffer.alloc(2000, 1);
    await expect(kindle.put(book("big.azw3", bytes), "big.azw3", bytes.length)).rejects.toBeInstanceOf(NoRoom);
    expect(device.log).not.toContain(OP.SendObjectInfo);
  });

  it("waits out a device that says it's busy", async () => {
    const { kindle } = await connect({ busy: 3 });
    expect((await kindle.space()).capacity).toBeGreaterThan(0);
  });

  describe("just plugged in", () => {
    beforeEach(() => void vi.useFakeTimers({ toFake: ["setTimeout"] }));
    afterEach(() => void vi.useRealTimers());

    it.each([
      ["offers no storage yet", { noStorageYet: 3 }],
      ["says its storage isn't available yet", { storageUnavailable: 3 }],
    ] as Array<[string, Quirks]>)("waits for a Kindle that %s", async (_name, quirks) => {
      const { kindle } = await connect(quirks);
      const space = kindle.space();
      await vi.advanceTimersByTimeAsync(3100);
      expect((await space).name).toBe("Internal Storage");
    });

    it("gives up in the end, and says the Kindle has no storage", async () => {
      const { kindle } = await connect({ noStorageYet: 100 });
      const space = kindle.space().catch((error) => error);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(((await space) as Error).message).toContain("no storage");
    });

    it("doesn't keep asking after an error that waiting won't fix", async () => {
      const { backend, device } = await connect();
      const before = device.log.length;
      device.failNext = 0x2002;
      const asked = backend.storages().catch((error) => error);
      await vi.advanceTimersByTimeAsync(0);
      expect((await asked as MtpError).code).toBe(0x2002);
      expect(device.log.length).toBe(before + 1);
    });
  });

  it("waits between tries when a device is busy, rather than hammering it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const { kindle, device } = await connect();
      device.setBusy(2);
      const space = kindle.space();
      await vi.advanceTimersByTimeAsync(100);
      const early = device.log.length;
      await vi.advanceTimersByTimeAsync(2000);
      await space;
      expect(device.log.length).toBeGreaterThan(early);
      expect(early).toBeLessThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up on a device that stays busy, with its answer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const { kindle, device } = await connect();
      device.setBusy(100);
      const space = kindle.space().catch((error) => error);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(((await space) as MtpError).code).toBe(0x2019);
    } finally {
      vi.useRealTimers();
    }
  });

  it("takes over a session someone else left open", async () => {
    const { kindle } = await connect({ sessionLeftOpen: true });
    expect((await kindle.space()).capacity).toBeGreaterThan(0);
  });

  it("copes with answers split up or run together", async () => {
    const docs = join(kindleRoot, "documents");
    // A size that exactly fills packets with its header, so the empty packet matters.
    writeFileSync(join(docs, "exact.azw3"), Buffer.alloc(512 * 4 - 12, 5));
    writeFileSync(join(docs, "other.pdf"), "pdf");
    for (const quirks of [{ splitHeaders: true }, { noEmptyPackets: true }] as Quirks[]) {
      const { kindle } = await connect(quirks);
      expect((await kindle.files()).length).toBe(2);
      const target = join(dir, "got.azw3");
      await kindle.get("exact.azw3", target);
      expect(readFileSync(target).length).toBe(512 * 4 - 12);
      await kindle.close();
    }
  });

  it("gives the error when the cable comes out halfway, and what's left doesn't count as a book", async () => {
    const { kindle } = await connect({ dropsAfter: 20_000 });
    const bytes = Buffer.alloc(300_000, 2);
    await expect(kindle.put(book("half.azw3", bytes), "half.azw3", bytes.length)).rejects.toThrow("unplugged");
    const { kindle: again } = await connect({ sessionLeftOpen: true });
    expect(await again.files()).toEqual([]);
    await again.put(book("half.azw3", bytes), "half.azw3", bytes.length);
    expect((await again.files()).map((f) => f.size)).toEqual([bytes.length]);
  });

  it("takes the file back off when a device refuses its data", async () => {
    const { kindle } = await connect({ refusesFiles: true });
    await expect(kindle.put(book("no.azw3", "abc"), "no.azw3", 3)).rejects.toMatchObject({ code: 0x200c });
    expect(existsSync(join(kindleRoot, "documents", "no.azw3"))).toBe(false);
  });

  it("doesn't believe a device that says a book arrived when part of it didn't, and takes it off", async () => {
    const { kindle } = await connect({ losesBytes: true });
    const bytes = Buffer.alloc(5000, 8);
    await expect(kindle.put(book("short.azw3", bytes), "short.azw3", bytes.length)).rejects.toBeInstanceOf(Incomplete);
    expect(existsSync(join(kindleRoot, "documents", "short.azw3"))).toBe(false);
  });

  it("stops looking a few folders down", async () => {
    const docs = join(kindleRoot, "documents");
    mkdirSync(join(docs, "1", "2", "3", "4"), { recursive: true });
    writeFileSync(join(docs, "1", "2", "3", "shallow.azw3"), "a");
    writeFileSync(join(docs, "1", "2", "3", "4", "deep.azw3"), "b");
    const { kindle } = await connect();
    expect((await kindle.files()).map((f) => f.name)).toEqual(["shallow.azw3"]);
  });

  it("closes its session and lets go of the device", async () => {
    const { kindle, device, closed } = await connect();
    await kindle.close();
    expect(device.log.at(-1)).toBe(OP.CloseSession);
    expect(closed()).toBe(true);
  });
});
