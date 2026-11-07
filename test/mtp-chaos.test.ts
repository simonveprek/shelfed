import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isBookFile, isSafeBookPath, isSafeName, lockedBy } from "../src/main/kindle-files";
import { MtpKindle } from "../src/main/mtp/kindle";
import { PretendKindle } from "../src/main/mtp/pretend";
import { encodeObjectInfo, FORMAT_UNDEFINED, OP, parseDeviceInfo, parseObjectInfo, parseStorageInfo, Reader, Session, type Pipe } from "../src/main/mtp/protocol";
import { SessionBackend } from "../src/main/mtp/session-backend";

/*
 * What happens when things go wrong in ways nobody planned for. Each run is
 * seeded, so anything these find fails the same way every time.
 */

/** A small repeatable random number generator. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, below: (n: number) => Math.floor(next() * n) };
}

function noise(rng: ReturnType<typeof random>, length: number) {
  const out = Buffer.alloc(length);
  for (let i = 0; i < length; i++) out[i] = rng.below(256);
  return out;
}

/** Failing is fine. Failing with one of these means the code tripped over its own feet instead of saying no. */
const expectACleanFailure = (error: unknown) => {
  expect(error, String(error)).toBeInstanceOf(Error);
  expect(error, String((error as Error).stack)).not.toBeInstanceOf(TypeError);
  expect(error, String((error as Error).stack)).not.toBeInstanceOf(RangeError);
};

let dir: string;
let root: string;
const realSetTimeout = globalThis.setTimeout;

// Waits between tries are real waits; here they'd only slow down thousands of runs.
beforeAll(() => vi.stubGlobal("setTimeout", (fn: () => void) => realSetTimeout(fn, 0)));
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shelf-chaos-"));
  root = join(dir, "kindle");
  mkdirSync(join(root, "documents"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("reading anything at all", () => {
  it("never trips over random bytes", () => {
    for (let seed = 0; seed < 3000; seed++) {
      const rng = random(seed);
      const bytes = noise(rng, rng.below(300));
      parseDeviceInfo(bytes);
      parseStorageInfo(bytes);
      parseObjectInfo(bytes);
      const reader = new Reader(bytes);
      reader.u32s();
      reader.string();
      reader.u64();
    }
  });

  it("reads back any truncated real answer without tripping", () => {
    const real = encodeObjectInfo({ storage: 1, parent: 2, format: FORMAT_UNDEFINED, size: 3, name: "Žluťoučký.azw3" });
    for (let length = 0; length <= real.length; length++) parseObjectInfo(real.subarray(0, length));
  });

  it("never trips deciding whether random bytes are a locked book", async () => {
    for (let seed = 0; seed < 2000; seed++) {
      const rng = random(seed);
      const bytes = noise(rng, rng.below(400));
      // Half the time it's marked as a MOBI, so the code gets past the first check.
      if (bytes.length >= 82 && rng.next() < 0.5) bytes.write("BOOKMOBI", 60, "latin1");
      await lockedBy("a.azw3", async (offset, length) => bytes.subarray(offset, offset + length));
    }
  });

  it("never trips on a random name, and never lets a separator through", () => {
    const pieces = ["..", ".", "/", "\\", "\0", "\n", "‮", "a", "😀", " ", "CON", ":", "azw3", ".azw3"];
    for (let seed = 0; seed < 3000; seed++) {
      const rng = random(seed);
      const name = Array.from({ length: rng.below(6) }, () => pieces[rng.below(pieces.length)]).join("");
      isBookFile(name);
      if (isSafeName(name)) {
        expect(name).not.toMatch(/[\\/\0\n‮]/);
        expect(name === "." || name === "..").toBe(false);
      }
      if (isSafeBookPath(name)) expect(name.split("/")).not.toContain("..");
    }
  });
});

describe("a device that only sends garbage", () => {
  /** Answers every read with random bytes, up to a limit that proves nothing went round forever. */
  function garbage(seed: number, reads = 3000): Pipe & { count: number } {
    const rng = random(seed);
    return {
      count: 0,
      packetSize: 512,
      async write() {},
      async read(max: number) {
        if (++this.count > reads) throw new Error("Went round and round");
        return noise(rng, Math.min(rng.below(200), max));
      },
    };
  }

  const operations: Array<[string, (s: Session) => Promise<unknown>]> = [
    ["open", (s) => s.open()],
    ["device info", (s) => s.deviceInfo()],
    ["storages", (s) => s.storageIds()],
    ["storage info", (s) => s.storageInfo(1)],
    ["handles", (s) => s.handles(1, 2)],
    ["object info", (s) => s.objectInfo(1)],
    ["part of a file", (s) => s.getPartial(1, 0, 100)],
    ["a whole file", (s) => s.getObject(1, () => {})],
    ["delete", (s) => s.remove(1)],
    ["announce", (s) => s.sendInfo({ storage: 1, parent: 2, format: FORMAT_UNDEFINED, size: 3, name: "a" })],
    ["send", (s) => s.send(3, [Buffer.from("abc")])],
  ];

  it.each(operations)("%s always ends, and ends cleanly", async (_name, operation) => {
    for (let seed = 0; seed < 300; seed++) {
      const pipe = garbage(seed);
      await operation(new Session(pipe)).catch(expectACleanFailure);
      expect(pipe.count).toBeLessThan(3000);
    }
  });
});

describe("a real conversation with damage in it", () => {
  /** A real pretend Kindle whose answers get flipped, cut short, doubled or lost along the way. */
  function damaged(device: PretendKindle, seed: number, rate: number): Pipe {
    const rng = random(seed);
    let reads = 0;
    return {
      packetSize: device.packetSize,
      write: (data) => device.write(data),
      async read(max) {
        if (++reads > 5000) throw new Error("Went round and round");
        const bytes = Buffer.from(await device.read(max));
        if (rng.next() > rate) return bytes;
        const kind = rng.below(4);
        if (kind === 0 && bytes.length) bytes[rng.below(bytes.length)] = rng.below(256);
        if (kind === 1) return bytes.subarray(0, rng.below(bytes.length + 1));
        if (kind === 2) return Buffer.concat([bytes, bytes]).subarray(0, max);
        if (kind === 3) return noise(rng, Math.min(64, max));
        return bytes;
      },
    };
  }

  it("never trips, never writes outside its folder, and leaves other books alone", async () => {
    const docs = join(root, "documents");
    const keep = Buffer.alloc(3000, 9);
    const source = join(dir, "source.azw3");
    const payload = Buffer.alloc(40_000, 5);
    writeFileSync(source, payload);
    for (let seed = 0; seed < 400; seed++) {
      writeFileSync(join(docs, "Keep.azw3"), keep);
      writeFileSync(join(docs, "Read.epub"), "epub contents");
      const out = join(dir, "out");
      mkdirSync(out, { recursive: true });
      const device = new PretendKindle(root);
      const pipe = damaged(device, seed, 0.05);
      try {
        const { backend } = await SessionBackend.start(pipe, async () => {});
        const kindle = new MtpKindle(backend);
        await kindle.space();
        await kindle.files();
        await kindle.get("Read.epub", join(out, "Read.epub"));
        await kindle.put(source, "New.azw3", payload.length);
        await kindle.remove(["New.azw3"]);
      } catch (error) {
        expectACleanFailure(error);
      }
      // A book nobody asked to touch hasn't changed, whatever arrived garbled.
      expect(readFileSync(join(docs, "Keep.azw3")).equals(keep), `seed ${seed}`).toBe(true);
      // A file copied here is whole or isn't there at all.
      for (const name of readdirSync(out)) expect(readFileSync(join(out, name), "utf8"), `seed ${seed}`).toBe("epub contents");
      rmSync(out, { recursive: true, force: true });
      rmSync(join(docs, "New.azw3"), { force: true });
      // Nothing appeared anywhere it shouldn't have.
      expect(readdirSync(dir).sort()).toEqual(["kindle", "source.azw3"]);
    }
  }, 60_000);
});

describe("the cable coming out at every possible moment", () => {
  /** Counts each trip down the cable, and fails from the chosen one on, as a pulled cable would. */
  function pullable(device: PretendKindle, at: number): Pipe & { trips: number } {
    return {
      trips: 0,
      packetSize: device.packetSize,
      async write(data) {
        if (++this.trips >= at) throw new Error("Cable out");
        await device.write(data);
      },
      async read(max) {
        if (++this.trips >= at) throw new Error("Cable out");
        return device.read(max);
      },
    };
  }

  const docs = () => join(root, "documents");
  const keep = Buffer.alloc(2000, 9);

  /** Runs a job with the cable pulled at each moment in turn, then plugs back in and checks all's well. */
  async function everyMoment(prepare: () => void, job: (kindle: MtpKindle) => Promise<unknown>, afterwards: (kindle: MtpKindle, finished: boolean) => Promise<void>) {
    // How many trips the whole job takes when nothing goes wrong.
    prepare();
    writeFileSync(join(docs(), "Keep.azw3"), keep);
    const clean = pullable(new PretendKindle(root), Infinity);
    await job(new MtpKindle((await SessionBackend.start(clean, async () => {})).backend));
    const total = clean.trips;
    expect(total).toBeGreaterThan(10);
    for (let at = 1; at <= total; at++) {
      rmSync(docs(), { recursive: true, force: true });
      mkdirSync(docs());
      prepare();
      writeFileSync(join(docs(), "Keep.azw3"), keep);
      const pipe = pullable(new PretendKindle(root), at);
      let finished = false;
      try {
        await job(new MtpKindle((await SessionBackend.start(pipe, async () => {})).backend));
        finished = true;
      } catch (error) {
        expectACleanFailure(error);
      }
      // Plugged back in, with a Kindle that remembers the session was never closed.
      const { backend } = await SessionBackend.start(new PretendKindle(root, { sessionLeftOpen: true }), async () => {});
      const kindle = new MtpKindle(backend);
      expect(readFileSync(join(docs(), "Keep.azw3")).equals(keep), `pulled at ${at} of ${total}`).toBe(true);
      await afterwards(kindle, finished);
    }
  }

  it("copying a new book: it's whole or doesn't count, and trying again works", async () => {
    const bytes = Buffer.alloc(3000, 4);
    const source = join(dir, "source.azw3");
    writeFileSync(source, bytes);
    await everyMoment(
      () => {},
      (kindle) => kindle.put(source, "New.azw3", bytes.length),
      async (kindle) => {
        const listed = (await kindle.files()).find((f) => f.name === "New.azw3");
        if (listed) expect(listed.size).toBe(bytes.length);
        await kindle.put(source, "New.azw3", bytes.length);
        expect(readFileSync(join(docs(), "New.azw3")).equals(bytes)).toBe(true);
      },
    );
    // What it started from was never touched.
    expect(readFileSync(source).equals(bytes)).toBe(true);
  }, 30_000);

  it("replacing a book: never half of one, and trying again works", async () => {
    const before = Buffer.alloc(1000, 1);
    const after = Buffer.alloc(3000, 2);
    const source = join(dir, "source.azw3");
    writeFileSync(source, after);
    await everyMoment(
      () => writeFileSync(join(docs(), "Book.azw3"), before),
      (kindle) => kindle.put(source, "Book.azw3", after.length),
      async (kindle) => {
        const listed = (await kindle.files()).find((f) => f.name === "Book.azw3");
        if (listed) expect([before.length, after.length]).toContain(listed.size);
        await kindle.put(source, "Book.azw3", after.length);
        expect(readFileSync(join(docs(), "Book.azw3")).equals(after)).toBe(true);
      },
    );
  }, 30_000);

  it("copying a book off: nothing partial is ever left here", async () => {
    const bytes = Buffer.alloc(3000, 3);
    const target = join(dir, "off.epub");
    await everyMoment(
      () => {
        rmSync(target, { force: true });
        writeFileSync(join(docs(), "Off.epub"), bytes);
      },
      (kindle) => kindle.get("Off.epub", target),
      async (kindle, finished) => {
        expect(existsSync(target)).toBe(finished);
        if (finished) expect(readFileSync(target).equals(bytes)).toBe(true);
        rmSync(target, { force: true });
        // And the book is still there to try again.
        await kindle.get("Off.epub", target);
        expect(readFileSync(target).equals(bytes)).toBe(true);
        rmSync(target, { force: true });
      },
    );
  }, 30_000);

  it("taking a book off: only that book, and trying again is harmless", async () => {
    await everyMoment(
      () => {
        writeFileSync(join(docs(), "Gone.azw3"), "gone");
        mkdirSync(join(docs(), "Gone.sdr"), { recursive: true });
        writeFileSync(join(docs(), "Gone.sdr", "notes"), "n");
      },
      (kindle) => kindle.remove(["Gone.azw3"]),
      async (kindle) => {
        await kindle.remove(["Gone.azw3"]);
        expect((await kindle.files()).map((f) => f.name)).toEqual(["Keep.azw3"]);
      },
    );
  }, 30_000);

  it("listing: it just fails, and changes nothing", async () => {
    const names = ["A.azw3", "B.epub", "C.pdf"];
    await everyMoment(
      () => names.forEach((name) => writeFileSync(join(docs(), name), "x")),
      (kindle) => kindle.files(),
      async (kindle) => {
        expect((await kindle.files()).map((f) => f.name).sort()).toEqual(["A.azw3", "B.epub", "C.pdf", "Keep.azw3"]);
      },
    );
  }, 30_000);
});

describe("copying a book that's already there", () => {
  const source = () => join(dir, "source.azw3");

  it("doesn't risk a good copy by sending the same book again", async () => {
    const bytes = Buffer.alloc(20_000, 6);
    writeFileSync(source(), bytes);
    writeFileSync(join(root, "documents", "Book.azw3"), bytes);
    const device = new PretendKindle(root);
    const { backend } = await SessionBackend.start(device, async () => {});
    const seen: number[] = [];
    expect(await new MtpKindle(backend).put(source(), "Book.azw3", bytes.length, (done) => seen.push(done))).toBe(bytes.length);
    expect(device.log).not.toContain(OP.DeleteObject);
    expect(device.log).not.toContain(OP.SendObject);
    expect(seen).toEqual([bytes.length]);
  });

  it.each([
    ["at the start", 0],
    ["at the end", 19_999],
  ])("does send it when it's the same size but differs %s", async (_where, at) => {
    const bytes = Buffer.alloc(20_000, 6);
    writeFileSync(source(), bytes);
    const other = Buffer.from(bytes);
    other[at] = 7;
    writeFileSync(join(root, "documents", "Book.azw3"), other);
    const { backend } = await SessionBackend.start(new PretendKindle(root), async () => {});
    await new MtpKindle(backend).put(source(), "Book.azw3", bytes.length);
    expect(readFileSync(join(root, "documents", "Book.azw3")).equals(bytes)).toBe(true);
  });

  it("sends it anyway when a device can't show part of a file", async () => {
    const bytes = Buffer.alloc(5000, 6);
    writeFileSync(source(), bytes);
    writeFileSync(join(root, "documents", "Book.azw3"), bytes);
    const device = new PretendKindle(root, { noPartial: true });
    const { backend } = await SessionBackend.start(device, async () => {});
    await new MtpKindle(backend).put(source(), "Book.azw3", bytes.length);
    expect(device.log).toContain(OP.SendObject);
  });

  it("handles an empty file and one smaller than what it compares", async () => {
    for (const size of [0, 1, 100]) {
      const bytes = Buffer.alloc(size, 6);
      writeFileSync(source(), bytes);
      writeFileSync(join(root, "documents", "Book.azw3"), bytes);
      const { backend } = await SessionBackend.start(new PretendKindle(root), async () => {});
      await new MtpKindle(backend).put(source(), "Book.azw3", size);
      expect(readFileSync(join(root, "documents", "Book.azw3")).length).toBe(size);
    }
  });
});
