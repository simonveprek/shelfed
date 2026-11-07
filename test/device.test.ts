import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() }, safeStorage: { isEncryptionAvailable: () => false } }));
const { copyToDevice, deviceFiles, filesFromDevice, isLocked, isPluggedIn, plainMailError, removeFromDevice, toKindles } = await import("../src/main/kindle");
const { PretendKindle } = await import("../src/main/mtp/pretend");
const { SessionBackend } = await import("../src/main/mtp/session-backend");
const { look, setConnector } = await import("../src/main/mtp");

let device: string;
beforeEach(async () => {
  device = await mkdtemp(join(tmpdir(), "shelf-kindle-"));
  await mkdir(join(device, "documents", "Dracula - Bram Stoker.sdr"), { recursive: true });
  await writeFile(join(device, "documents", "Dracula - Bram Stoker.azw3"), "a book");
  await writeFile(join(device, "documents", "Dracula - Bram Stoker.sdr", "notes.pds"), "notes");
  await writeFile(join(device, "documents", "My Clippings.txt"), "clippings");
  await writeFile(join(device, "outside.azw3"), "not in documents");
});
afterEach(() => rm(device, { recursive: true, force: true }));

describe("books on a Kindle plugged in as a drive", () => {
  it("are listed with their size and where they are", async () => {
    expect(await deviceFiles(device)).toContainEqual({ name: "Dracula - Bram Stoker.azw3", path: "Dracula - Bram Stoker.azw3", size: 6 });
  });

  it("go with their notes folder, and nothing outside documents or that isn't a book goes", async () => {
    const freed = await removeFromDevice(device, ["Dracula - Bram Stoker.azw3", "../outside.azw3", "My Clippings.txt", "/etc/hosts"]);
    expect(freed).toBe(6);
    expect(existsSync(join(device, "documents", "Dracula - Bram Stoker.azw3"))).toBe(false);
    expect(existsSync(join(device, "documents", "Dracula - Bram Stoker.sdr"))).toBe(false);
    expect(existsSync(join(device, "outside.azw3"))).toBe(true);
    expect(existsSync(join(device, "documents", "My Clippings.txt"))).toBe(true);
  });
});

/** A MOBI file as far as its first record's header, with its encryption field set. */
function mobi(encryption: number) {
  const file = Buffer.alloc(96);
  file.write("BOOKMOBI", 60, "latin1");
  file.writeUInt16BE(1, 76);
  file.writeUInt32BE(80, 78);
  file.writeUInt16BE(encryption, 80 + 12);
  return file;
}

describe("books locked to a Kindle", () => {
  it("are KFX, Topaz, and MOBI with DRM; the rest open anywhere", async () => {
    const docs = join(device, "documents");
    await writeFile(join(docs, "Mine.azw3"), mobi(0));
    await writeFile(join(docs, "Bought_EBOK.azw"), mobi(2));
    await writeFile(join(docs, "Bought.kfx"), "kfx");
    await writeFile(join(docs, "Old.azw"), Buffer.concat([Buffer.from("TPZ0"), Buffer.alloc(100)]));
    await writeFile(join(docs, "Essay.pdf"), "%PDF");
    expect(await isLocked(join(docs, "Mine.azw3"))).toBe(false);
    expect(await isLocked(join(docs, "Bought_EBOK.azw"))).toBe(true);
    expect(await isLocked(join(docs, "Bought.kfx"))).toBe(true);
    expect(await isLocked(join(docs, "Old.azw"))).toBe(true);
    expect(await isLocked(join(docs, "Essay.pdf"))).toBe(false);
    const listed = await deviceFiles(device);
    expect(listed.find((f) => f.name === "Bought_EBOK.azw")?.locked).toBe(true);
    expect(listed.find((f) => f.name === "Mine.azw3")?.locked).toBeUndefined();
  });
});

describe("a mail service turning a password away", () => {
  it("says to use an app password; other errors stay as they were", () => {
    const refused = Object.assign(new Error("535-5.7.8 Username and Password not accepted"), { code: "EAUTH", responseCode: 535 });
    expect((plainMailError(refused) as Error).message).toMatch(/app password/);
    const offline = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "EDNS" });
    expect(plainMailError(offline)).toBe(offline);
  });
});

describe("a Kindle reached over MTP, from the same calls as a drive", () => {
  const usb = { serial: "G000TEST", model: "colorsoft" };
  const path = "mtp:G000TEST";

  beforeEach(async () => {
    await writeFile(join(device, "documents", "Dracula - Bram Stoker.azw3"), "a book");
    setConnector(async () => SessionBackend.start(new PretendKindle(device), async () => {}));
    look([usb]);
    await vi.waitFor(() => expect(look([usb]).usb[0].link).toBe("ready"));
  });
  afterEach(() => void look([]));

  it("lists, copies and removes through the Kindle's own code", async () => {
    expect((await deviceFiles(path)).map((f) => f.name)).toContain("Dracula - Bram Stoker.azw3");
    const file = join(device, "from-library.azw3");
    await writeFile(file, "new book");
    const seen: number[] = [];
    expect(await copyToDevice(path, file, "Dune.azw3", (fraction) => seen.push(fraction))).toBe(8);
    expect(existsSync(join(device, "documents", "Dune.azw3"))).toBe(true);
    expect(seen.at(-1)).toBe(1);
    expect(await removeFromDevice(path, ["Dune.azw3"])).toBe(8);
    expect(existsSync(join(device, "documents", "Dune.azw3"))).toBe(false);
  });

  it("copies files off first, and says they're temporary", async () => {
    const { paths, temporary } = await filesFromDevice(path, ["Dracula - Bram Stoker.azw3"]);
    expect(temporary).toBe(true);
    expect(paths[0].startsWith(tmpdir())).toBe(true);
    await rm(join(paths[0], ".."), { recursive: true });
  });

  it("leaves a drive's files where they are", async () => {
    const { paths, temporary } = await filesFromDevice(device, ["Dracula - Bram Stoker.azw3"]);
    expect(temporary).toBe(false);
    expect(paths).toEqual([join(device, "documents", "Dracula - Bram Stoker.azw3")]);
  });
});

describe("paths the page gives", () => {
  it.each(["../../../etc/passwd.txt", "/etc/hosts.txt", "..", "", "picture.png"])("won't read %j off a drive as a book", async (file) => {
    await expect(filesFromDevice(device, [file])).rejects.toThrow("isn't on your Kindle");
  });

  it("isn't fooled by a path that leaves and comes back", async () => {
    await expect(filesFromDevice(device, ["../elsewhere/documents/x.azw3"])).rejects.toThrow("isn't on your Kindle");
    const { paths } = await filesFromDevice(device, ["sub/../Dune.azw3"]);
    expect(paths).toEqual([join(device, "documents", "Dune.azw3")]);
  });

  it("doesn't take a folder on this computer for a Kindle", async () => {
    expect(await isPluggedIn(tmpdir())).toBe(false);
    expect(await isPluggedIn(device)).toBe(false);
  }, 30_000);

  it("doesn't take a Kindle it hasn't opened for one that's plugged in", async () => {
    expect(await isPluggedIn("mtp:NOSUCHKINDLE")).toBe(false);
  });
});

describe("everything the main process sends", () => {
  it("is on the list the page is allowed to hear", () => {
    const main = readFileSync(join(import.meta.dirname, "../src/main/index.ts"), "utf8");
    const preload = readFileSync(join(import.meta.dirname, "../src/preload/index.ts"), "utf8");
    const allowed = new Set([...(preload.match(/channels = new Set\(\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]));
    const sent = [...main.matchAll(/\bsend\("([^"]+)"/g)].map((m) => m[1]);
    expect(sent).toContain("kindle-copy");
    for (const channel of sent) expect(allowed, `${channel} is sent but never heard`).toContain(channel);
  });
});

describe("serials off the USB bus", () => {
  it("keeps ordinary ones, once each", () => {
    expect(toKindles(["G0901234", "G0901234", "B024ABCD"]).map((k) => k.serial)).toEqual(["G0901234", "B024ABCD"]);
  });

  it.each(["", "with space", "new\nline", "\u202eevil", "x".repeat(65), "žluť"])("drops %j", (serial) => {
    expect(toKindles([serial])).toEqual([]);
  });
});

describe("how the app is packed and built", () => {
  const read = (path: string) => readFileSync(join(import.meta.dirname, "..", path), "utf8");

  it.each(["runAsNode", "enableNodeOptionsEnvironmentVariable", "enableNodeCliInspectArguments"])("keeps %s off, so nothing can run code through the app", (fuse) => {
    expect(read("electron-builder.yml")).toMatch(new RegExp(`^  ${fuse}: false\\r?$`, "m"));
  });

  it.each(["onlyLoadAppFromAsar", "enableEmbeddedAsarIntegrityValidation", "resetAdHocDarwinSignature"])("keeps %s on", (fuse) => {
    expect(read("electron-builder.yml")).toMatch(new RegExp(`^  ${fuse}: true\\r?$`, "m"));
  });

  it.each(["ci", "pages", "release", "screens"])("pins every action in %s to an exact commit", (name) => {
    const uses = [...read(`.github/workflows/${name}.yml`).matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(action).toMatch(/@[0-9a-f]{40}$/);
  });

  it.each(["ci", "screens"])("gives %s no more than read access", (name) => {
    expect(read(`.github/workflows/${name}.yml`)).toMatch(/^permissions:\r?\n  contents: read\r?$/m);
  });
});
