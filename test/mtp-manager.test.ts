import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KindleBusy, NoMtp, type Backend, type Entry } from "../src/main/mtp/kindle";

vi.mock("electron", () => ({ shell: {}, app: { getPath: () => tmpdir() } }));
const logged = vi.hoisted(() => [] as string[]);
vi.mock("electron-log/main", () => {
  const keep = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  return { default: { info: keep, warn: keep } };
});
const { isMtpPath, kindleName, kindleReport, look, mtpClippings, mtpCopy, mtpFetch, mtpFiles, mtpRemove, plainMtpError, readyDevices, reportable, setConnector, closeAll } = await import("../src/main/mtp");
const { Incomplete, NoRoom } = await import("../src/main/mtp/kindle");

const SERIAL = "G000TEST";
const PATH = `mtp:${SERIAL}`;
/** A Colorsoft, so it connects like a phone and is opened straight away. */
const COLORSOFT = { serial: SERIAL, model: "colorsoft" };

/** An in-memory Kindle, with a record of how it's used. */
class Memory implements Backend {
  files = new Map<string, string>();
  free = 1_000_000;
  closed = 0;
  active = 0;
  mostAtOnce = 0;
  listed = 0;
  claimedSize: number | null = null;
  spaceAsked = 0;
  sendFails: Error | null = null;
  fetchFails: string | null = null;
  gate: Promise<void> | null = null;

  private async busy<T>(job: () => T | Promise<T>): Promise<T> {
    this.active++;
    this.mostAtOnce = Math.max(this.mostAtOnce, this.active);
    await Promise.resolve();
    if (this.gate) await this.gate;
    try {
      return await job();
    } finally {
      this.active--;
    }
  }
  storages() {
    this.spaceAsked++;
    return this.busy(() => [{ id: "s", name: "Internal Storage", capacity: 2_000_000, free: this.free }]);
  }
  children(_storage: string, parent: string | null) {
    return this.busy((): Entry[] => {
      if (parent === null) return [{ id: "docs", name: "documents", size: 0, folder: true }];
      this.listed++;
      return [...this.files].map(([name, text]) => ({ id: name, name, size: this.claimedSize ?? text.length, folder: false }));
    });
  }
  makeFolder() {
    return this.busy(() => "docs");
  }
  send(_storage: string, _parent: string, name: string, file: string, size: number, progress?: (done: number) => void) {
    return this.busy(() => {
      if (this.sendFails) throw this.sendFails;
      this.files.set(name, readFileSync(file, "utf8"));
      this.free -= size;
      progress?.(size);
      return name;
    });
  }
  fetch(id: string, file: string) {
    return this.busy(() => {
      if (this.fetchFails === id) throw new Error("cable out");
      writeFileSync(file, this.files.get(id) ?? "");
    });
  }
  read() {
    return this.busy(() => null);
  }
  remove(id: string) {
    return this.busy(() => {
      this.free += this.files.get(id)?.length ?? 0;
      this.files.delete(id);
    });
  }
  async close() {
    this.closed++;
  }
}

let dir: string;
let temp: string;
let memory: Memory;
let connects: Array<{ serial: string; afterFailure: boolean }>;
let connectFails: Error | null;

const settle = () => vi.advanceTimersByTimeAsync(0);
/** Plugs in a Kindle and lets it finish opening. */
const plugIn = async (usb = COLORSOFT) => {
  look([usb]);
  await settle();
  return look([usb]);
};

const realTemp = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  dir = mkdtempSync(join(tmpdir(), "shelf-manager-"));
  // A temporary folder of this test's own, since other test files use the shared one at the same time.
  temp = join(dir, "temp");
  mkdirSync(temp);
  process.env.TMPDIR = process.env.TMP = process.env.TEMP = temp;
  memory = new Memory();
  connects = [];
  connectFails = null;
  setConnector(async (serial, afterFailure) => {
    connects.push({ serial, afterFailure });
    if (connectFails) throw connectFails;
    return { backend: memory };
  });
});

afterEach(async () => {
  look([]);
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  Object.assign(process.env, realTemp);
  rmSync(dir, { recursive: true, force: true });
});

const book = (name: string, text: string) => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};

describe("noticing a Kindle", () => {
  it("opens one that connects like a phone straight away, and shows it as a device", async () => {
    const first = look([COLORSOFT]);
    expect(first.usb[0].link).toBe("opening");
    expect(first.devices).toEqual([]);
    await settle();
    const then = look([COLORSOFT]);
    expect(then.usb[0].link).toBe("ready");
    expect(then.devices).toEqual([{ name: "Kindle Colorsoft", path: PATH, free: 1_000_000, model: "colorsoft" }]);
    expect(isMtpPath(then.devices[0].path)).toBe(true);
  });

  it("gives one it doesn't know time to open as a drive first", async () => {
    const stranger = { serial: "UNKNOWN" };
    look([stranger]);
    await settle();
    expect(connects).toEqual([]);
    await vi.advanceTimersByTimeAsync(9000);
    look([stranger]);
    await settle();
    expect(connects).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    look([stranger]);
    await settle();
    expect(connects.map((c) => c.serial)).toEqual(["UNKNOWN"]);
  });

  it("doesn't open one again once it's open", async () => {
    await plugIn();
    await vi.advanceTimersByTimeAsync(60_000);
    look([COLORSOFT]);
    await settle();
    expect(connects.length).toBe(1);
  });

  it("doesn't start a second open while the first is going", async () => {
    let open = () => {};
    let calls = 0;
    setConnector(async () => {
      calls++;
      await new Promise<void>((resolve) => (open = resolve));
      return { backend: memory };
    });
    look([COLORSOFT]);
    await settle();
    await vi.advanceTimersByTimeAsync(30_000);
    look([COLORSOFT]);
    await settle();
    expect(calls).toBe(1);
    open();
    await settle();
    expect(memory.spaceAsked).toBe(1);
  });

  it("says when another app has it, and connects by itself once it's let go", async () => {
    connectFails = new KindleBusy("exclusive");
    const seen = await plugIn();
    expect(seen.usb[0].link).toBe("busy");
    expect(seen.devices).toEqual([]);
    connectFails = null;
    await vi.advanceTimersByTimeAsync(9000);
    look([COLORSOFT]);
    await settle();
    expect(look([COLORSOFT]).usb[0].link).toBe("ready");
  });

  it("doesn't keep hammering a Kindle another app has", async () => {
    connectFails = new KindleBusy("exclusive");
    await plugIn();
    await vi.advanceTimersByTimeAsync(2000);
    look([COLORSOFT]);
    await settle();
    expect(connects.length).toBe(1);
  });

  it("tells one with no MTP from one that failed", async () => {
    connectFails = new NoMtp();
    expect((await plugIn()).usb[0].link).toBe("none");
    look([]);
    await settle();
    connectFails = new Error("nope");
    expect((await plugIn()).usb[0].link).toBe("failed");
  });

  it("lets go of a Kindle when it's unplugged, and forgets it", async () => {
    await plugIn();
    look([]);
    await settle();
    expect(memory.closed).toBe(1);
    expect(readyDevices()).toEqual([]);
    await expect(mtpFiles(PATH)).rejects.toThrow("isn't plugged in");
  });
});

describe("more than one Kindle", () => {
  const other = { serial: "G000OTHER", model: "colorsoft" };

  it("keeps them apart, each with its own connection", async () => {
    const backends = new Map<string, Memory>([[SERIAL, memory], [other.serial, new Memory()]]);
    setConnector(async (serial) => ({ backend: backends.get(serial)! }));
    look([COLORSOFT, other]);
    await settle();
    expect(look([COLORSOFT, other]).devices.map((d) => d.path)).toEqual([PATH, `mtp:${other.serial}`]);
    await mtpCopy(PATH, book("a.azw3", "a"), "a.azw3", 1);
    expect([...memory.files.keys()]).toEqual(["a.azw3"]);
    expect(backends.get(other.serial)!.files.size).toBe(0);
  });

  it("unplugging one leaves the other alone", async () => {
    const second = new Memory();
    setConnector(async (serial) => ({ backend: serial === SERIAL ? memory : second }));
    look([COLORSOFT, other]);
    await settle();
    look([other]);
    await settle();
    expect(memory.closed).toBe(1);
    expect(second.closed).toBe(0);
    expect(look([other]).devices.map((d) => d.path)).toEqual([`mtp:${other.serial}`]);
    await expect(mtpFiles(`mtp:${other.serial}`)).resolves.toEqual([]);
  });

  it("one going wrong doesn't hold up the other", async () => {
    const second = new Memory();
    setConnector(async (serial) => ({ backend: serial === SERIAL ? memory : second }));
    look([COLORSOFT, other]);
    await settle();
    let release = () => {};
    memory.gate = new Promise<void>((resolve) => (release = resolve));
    const stuck = mtpFiles(PATH);
    await expect(mtpFiles(`mtp:${other.serial}`)).resolves.toEqual([]);
    release();
    memory.gate = null;
    await stuck;
  });

  it("starts clean when one is plugged back in", async () => {
    connectFails = new KindleBusy("exclusive");
    await plugIn();
    look([]);
    await settle();
    connectFails = null;
    const seen = await plugIn();
    expect(seen.usb[0].link).toBe("ready");
    expect(connects.at(-1)?.afterFailure).toBe(false);
  });
});

describe("holding on to a Kindle", () => {
  it("lets go after a few quiet seconds, so other apps can have it", async () => {
    await plugIn();
    expect(memory.closed).toBe(0);
    await vi.advanceTimersByTimeAsync(5100);
    expect(memory.closed).toBe(1);
  });

  it("stays connected while it's kept busy", async () => {
    await plugIn();
    await vi.advanceTimersByTimeAsync(3000);
    await mtpFiles(PATH);
    await vi.advanceTimersByTimeAsync(3000);
    expect(memory.closed).toBe(0);
    expect(connects.length).toBe(1);
  });

  it("connects again when it's needed after letting go", async () => {
    await plugIn();
    await vi.advanceTimersByTimeAsync(5100);
    await mtpFiles(PATH);
    expect(connects.length).toBe(2);
    expect(connects[1].afterFailure).toBe(false);
  });

  it("does one thing at a time, in order", async () => {
    await plugIn();
    memory.files.set("a.azw3", "a");
    await Promise.all([mtpFiles(PATH), mtpCopy(PATH, book("b.azw3", "b"), "b.azw3", 1), mtpRemove(PATH, ["a.azw3"]), mtpFiles(PATH)]);
    expect(memory.mostAtOnce).toBe(1);
    expect([...memory.files.keys()]).toEqual(["b.azw3"]);
  });

  it("carries on with the next job after one fails", async () => {
    await plugIn();
    memory.sendFails = new Error("cable out");
    await expect(mtpCopy(PATH, book("b.azw3", "b"), "b.azw3", 1)).rejects.toThrow("stopped answering");
    memory.sendFails = null;
    await expect(mtpCopy(PATH, book("c.azw3", "c"), "c.azw3", 1)).resolves.toBe(1);
  });

  it("starts afresh after a failure, telling the connection it ended badly", async () => {
    await plugIn();
    memory.sendFails = new Error("cable out");
    await mtpCopy(PATH, book("b.azw3", "b"), "b.azw3", 1).catch(() => {});
    expect(memory.closed).toBe(1);
    memory.sendFails = null;
    await mtpFiles(PATH);
    expect(connects.at(-1)?.afterFailure).toBe(true);
    // And only the once.
    await vi.advanceTimersByTimeAsync(5100);
    await mtpRemove(PATH, ["nothing.azw3"]);
    expect(connects.at(-1)?.afterFailure).toBe(false);
  });

  it("keeps the connection when a book is too big to copy off", async () => {
    await plugIn();
    memory.files.set("Huge.epub", "x");
    memory.claimedSize = 3 * 1024 * 1024 * 1024;
    await expect(mtpFetch(PATH, ["Huge.epub"])).rejects.toThrow("too big");
    expect(memory.closed).toBe(0);
    expect(connects.length).toBe(1);
  });

  it("keeps the connection when a book simply doesn't fit", async () => {
    await plugIn();
    memory.free = 1;
    await expect(mtpCopy(PATH, book("big.azw3", "big"), "big.azw3", 3)).rejects.toThrow("isn't room");
    expect(memory.closed).toBe(0);
    expect(connects.length).toBe(1);
  });

  it("notices another app taking it mid-session, and says so", async () => {
    await plugIn();
    await vi.advanceTimersByTimeAsync(5100);
    connectFails = new KindleBusy("exclusive");
    await expect(mtpFiles(PATH)).rejects.toThrow("Another app");
    const seen = look([COLORSOFT]);
    expect(seen.usb[0].link).toBe("busy");
    expect(seen.devices).toEqual([]);
  });

  it("lets go of everything when asked, finishing what's going first", async () => {
    await plugIn();
    let release = () => {};
    memory.gate = new Promise<void>((resolve) => (release = resolve));
    const listing = mtpFiles(PATH);
    const closing = closeAll();
    await settle();
    expect(memory.closed).toBe(0);
    release();
    memory.gate = null;
    await listing;
    await closing;
    expect(memory.closed).toBe(1);
  });
});

describe("what's on it", () => {
  it("doesn't read it all again every time it's asked", async () => {
    await plugIn();
    memory.files.set("a.azw3", "a");
    expect((await mtpFiles(PATH)).map((f) => f.name)).toEqual(["a.azw3"]);
    const after = memory.listed;
    await mtpFiles(PATH);
    await vi.advanceTimersByTimeAsync(40_000);
    await mtpFiles(PATH);
    expect(memory.listed).toBe(after);
  });

  it("reads it again after a while", async () => {
    await plugIn();
    await mtpFiles(PATH);
    const after = memory.listed;
    memory.files.set("new.azw3", "n");
    await vi.advanceTimersByTimeAsync(46_000);
    expect((await mtpFiles(PATH)).map((f) => f.name)).toEqual(["new.azw3"]);
    expect(memory.listed).toBeGreaterThan(after);
  });

  it("knows at once about what Shelfed itself changed", async () => {
    await plugIn();
    expect(await mtpFiles(PATH)).toEqual([]);
    await mtpCopy(PATH, book("a.azw3", "abc"), "a.azw3", 3);
    expect((await mtpFiles(PATH)).map((f) => f.name)).toEqual(["a.azw3"]);
    await mtpRemove(PATH, ["a.azw3"]);
    expect(await mtpFiles(PATH)).toEqual([]);
  });

  it("keeps the room it shows up to date", async () => {
    await plugIn();
    await mtpCopy(PATH, book("a.azw3", "abc"), "a.azw3", 3);
    expect(look([COLORSOFT]).devices[0].free).toBe(999_997);
    expect(await mtpRemove(PATH, ["a.azw3"])).toBe(3);
    expect(look([COLORSOFT]).devices[0].free).toBe(1_000_000);
  });

  it("passes a copy's progress on as a fraction", async () => {
    await plugIn();
    const seen: number[] = [];
    await mtpCopy(PATH, book("a.azw3", "abcd"), "a.azw3", 4, (fraction) => seen.push(fraction));
    expect(seen).toEqual([1]);
  });

  it("copies files off to temporary folders the clean-up recognises", async () => {
    await plugIn();
    memory.files.set("a.epub", "one");
    memory.files.set("b.epub", "two");
    const paths = await mtpFetch(PATH, ["a.epub", "b.epub"]);
    expect(paths.map((p) => readFileSync(p, "utf8"))).toEqual(["one", "two"]);
    for (const path of paths) {
      expect(dirname(dirname(path))).toBe(temp);
      expect(basename(dirname(path))).toMatch(/^shelf-/);
    }
  });

  it("leaves nothing behind when copying off fails partway", async () => {
    await plugIn();
    memory.files.set("a.epub", "one");
    memory.files.set("b.epub", "two");
    memory.fetchFails = "b.epub";
    await expect(mtpFetch(PATH, ["a.epub", "b.epub"])).rejects.toThrow();
    expect(readdirSync(temp)).toEqual([]);
  });

  it("reads the highlights file off each Kindle that has one, and leaves no copy", async () => {
    await plugIn();
    expect(await mtpClippings()).toEqual([]);
    memory.files.set("My Clippings.txt", "highlights");
    expect(await mtpClippings()).toEqual([{ device: "Kindle Colorsoft", text: "highlights" }]);
    expect(readdirSync(temp)).toEqual([]);
  });
});

describe("names from a device, on this computer", () => {
  it.each(["CON.azw3", "nul.epub", "a:b.azw3", 'q"uo?te*.pdf', "dots at the end..epub", "  spaces  .epub"])("keeps %s inside the temporary folder, under a usable name", async (name) => {
    await plugIn();
    memory.files.set(name, "book");
    const [path] = await mtpFetch(PATH, [name]);
    expect(dirname(dirname(path))).toBe(temp);
    expect(basename(path)).not.toMatch(/[:"?*]/);
    expect(basename(path)).not.toMatch(/^(con|nul)(\.|$)/i);
    expect(basename(path)).not.toMatch(/[. ]$/);
    // Still the type of file it was, or it couldn't be added to the library.
    expect(extname(path)).toBe(extname(name));
    expect(basename(path, extname(path))).not.toMatch(/[. ]$/);
    expect(readFileSync(path, "utf8")).toBe("book");
  });

  it.each(["../../evil.azw3", "..", "a/../../evil.azw3", "/etc/evil.azw3", "evil.png", "My Clippings.txt", "a\\..\\evil.azw3"])("won't copy off %s if the page asks", async (path) => {
    await plugIn();
    memory.files.set("evil.azw3", "x");
    await expect(mtpFetch(PATH, [path])).rejects.toThrow("isn't on your Kindle");
    expect(readdirSync(temp)).toEqual([]);
  });
});

describe("a report for support", () => {
  it("says what the Kindle is and how it's doing", async () => {
    setConnector(async () => ({ backend: memory, about: "Amazon Kindle 1.0, USB 1949:9981" }));
    await plugIn();
    const report = kindleReport();
    expect(report).toContain("model colorsoft");
    expect(report).toContain("Connection: ready");
    expect(report).toContain("USB 1949:9981");
  });

  it("says what went wrong", async () => {
    connectFails = new Error("LIBUSB_ERROR_IO");
    await plugIn();
    expect(kindleReport()).toContain("Last problem: LIBUSB_ERROR_IO");
  });

  it("says nothing about the books, or the whole serial", async () => {
    await plugIn();
    memory.files.set("A Very Private Book.azw3", "x");
    await mtpFiles(PATH);
    memory.fetchFails = "A Very Private Book.azw3";
    await mtpFetch(PATH, ["A Very Private Book.azw3"]).catch(() => {});
    await mtpFetch(PATH, ["Not There.azw3"]).catch(() => {});
    const report = kindleReport();
    expect(report).not.toContain("Private");
    expect(report).not.toContain("Not There");
    expect(report).toContain("G000TE");
    expect(report).not.toContain(SERIAL);
  });

  it("keeps the whole serial out of the log too", async () => {
    logged.length = 0;
    await plugIn();
    connectFails = new KindleBusy("exclusive");
    await vi.advanceTimersByTimeAsync(5100);
    await mtpFiles(PATH).catch(() => {});
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join("\n")).not.toContain(SERIAL);
  });

  it("only repeats what a device says about itself as plain, short text", async () => {
    setConnector(async () => ({ backend: memory, about: `Evil\u202e\u0000${"x".repeat(5000)}` }));
    await plugIn();
    const about = kindleReport().split("Device: ")[1];
    expect(about.startsWith("Evil??x")).toBe(true);
    expect(about.length).toBe(1000);
  });

  it("says when there's nothing to report", () => {
    expect(kindleReport()).toContain("No Kindle");
  });

  it("takes the name of whoever's computer it is out of a problem", () => {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    expect(reportable(new Error(`No helper at ${home}/secret/x.exe`))).toBe("No helper at ~/secret/x.exe");
  });

  it("keeps a problem short and in plain characters", () => {
    expect(reportable(new Error("bad\u0000\u202e" + "x".repeat(1000))).length).toBe(300);
    expect(reportable(new Error("bad\u0000"))).toBe("bad?");
  });
});

describe("saying what went wrong", () => {
  it("says how much room a book needs, and how much there is", () => {
    expect(plainMtpError(new NoRoom(3_000_000_000, 500_000_000)).message).toBe("There isn't room on your Kindle for this. It needs 3.0 GB, and 500 MB is free.");
  });

  it("names the other cases", () => {
    expect(plainMtpError(new KindleBusy("x")).message).toContain("Another app");
    expect(plainMtpError(new Incomplete("x")).message).toContain("didn't arrive whole");
    expect(plainMtpError(new Error("LIBUSB_ERROR_IO")).message).toContain("stopped answering");
  });

  it("never shows anyone the technical reason", () => {
    expect(plainMtpError(new Error("0x80070005")).message).not.toContain("0x");
  });
});

describe("a name a Kindle can hold", () => {
  it("leaves an ordinary name alone", () => {
    expect(kindleName("Dune - Frank Herbert.azw3")).toBe("Dune - Frank Herbert.azw3");
  });

  it("shortens a long one and keeps its extension", () => {
    const short = kindleName(`${"x".repeat(300)}.azw3`);
    expect(short.length).toBe(200);
    expect(short.endsWith(".azw3")).toBe(true);
  });

  it("doesn't cut a character written as two units in half", () => {
    const short = kindleName(`${"x".repeat(194)}😀😀😀😀.azw3`);
    expect(short.endsWith(".azw3")).toBe(true);
    expect(short).toBe(short.toWellFormed());
  });

  it("doesn't leave a space before the extension", () => {
    expect(kindleName(`${"x".repeat(194)} ${"y".repeat(50)}.azw3`)).not.toContain(" .azw3");
  });
});

