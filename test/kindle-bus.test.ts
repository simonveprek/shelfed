import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Backend } from "../src/main/mtp/kindle";
import { kindleById } from "../src/shared/kindles";

/** What the system answers when asked what's on USB, or an error. */
const system = vi.hoisted(() => ({ answer: "" as string | Error, asked: 0, volumes: [] as string[] }));

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() }, safeStorage: { isEncryptionAvailable: () => false }, shell: {} }));
vi.mock("electron-log/main", () => ({ default: { info: () => {}, warn: () => {} } }));
vi.mock("node:child_process", async (actual) => ({
  ...(await actual<typeof import("node:child_process")>()),
  execFile: (_command: string, _args: string[], _options: object, done: (error: Error | null, value?: { stdout: string }) => void) => {
    system.asked++;
    if (system.answer instanceof Error) done(system.answer);
    else done(null, { stdout: system.answer });
  },
}));
vi.mock("node:fs/promises", async (actual) => {
  const real = await actual<typeof import("node:fs/promises")>();
  return { ...real, readdir: (path: string, ...rest: never[]) => (path === "/Volumes" ? Promise.resolve(system.volumes) : (real.readdir as (...a: unknown[]) => unknown)(path, ...rest)) };
});

const { findDevices, isPluggedIn, kindlePort, kindlesOnUsb } = await import("../src/main/kindle");
const { look, setConnector } = await import("../src/main/mtp");

const realPlatform = process.platform;
const on = (platform: string) => Object.defineProperty(process, "platform", { value: platform });

/** A serial that gives away a Colorsoft, built from what Shelfed knows of its codes. */
const COLORSOFT = `G0X${kindleById("colorsoft")!.codes[0]}ABCDEFGH`;

/** ioreg's answer for some USB devices, in the shape it really has. */
const ioreg = (...devices: Array<{ vendor: number; serial?: string; key?: string }>) =>
  `+-o Root  <class IORegistryEntry>\n${devices
    .map(({ vendor, serial, key = "USB Serial Number" }) => `  +-o Device@00100000  <class IOUSBHostDevice>\n    {\n      "idVendor" = ${vendor}\n      "idProduct" = 39297\n${serial ? `      "${key}" = "${serial}"\n` : ""}    }\n`)
    .join("")}`;

beforeEach(() => {
  system.answer = "";
  system.asked = 0;
  system.volumes = [];
  on("darwin");
});

afterEach(async () => {
  look([]);
  await new Promise((r) => setTimeout(r, 0));
  on(realPlatform);
});

describe("finding a Kindle on a Mac", () => {
  it("picks Amazon's devices out of what's on USB", async () => {
    system.answer = ioreg({ vendor: 1452, serial: "APPLE" }, { vendor: 6473, serial: COLORSOFT });
    expect(await kindlesOnUsb()).toEqual([{ serial: COLORSOFT, model: "colorsoft" }]);
  });

  it("doesn't take a vendor that only starts the same", async () => {
    system.answer = ioreg({ vendor: 64730, serial: "NOTAMAZON" });
    expect(await kindlesOnUsb()).toEqual([]);
  });

  it("reads the serial however the system names it", async () => {
    system.answer = ioreg({ vendor: 6473, serial: "G0XAAA1", key: "kUSBSerialNumberString" });
    expect((await kindlesOnUsb()).map((k) => k.serial)).toEqual(["G0XAAA1"]);
  });

  it("skips one with no serial, and keeps a Kindle it doesn't know", async () => {
    system.answer = ioreg({ vendor: 6473 }, { vendor: 6473, serial: "UNKNOWN1" });
    expect(await kindlesOnUsb()).toEqual([{ serial: "UNKNOWN1", model: undefined }]);
  });

  it("finds nothing, without complaint, when the system won't say", async () => {
    system.answer = new Error("ioreg not found");
    expect(await kindlesOnUsb()).toEqual([]);
    expect(await findDevices()).toEqual([]);
  });

  it("doesn't take a device with a bad serial for a Kindle", async () => {
    system.answer = ioreg({ vendor: 6473, serial: "has spaces in it" });
    expect(await kindlesOnUsb()).toEqual([]);
  });
});

describe("finding a Kindle on Windows", () => {
  beforeEach(() => on("win32"));
  const answer = (serials: string, drives = "") => `S=${serials}\r\nD=${drives}\r\n`;

  it("takes the serial from the end of the device's id", async () => {
    system.answer = answer(`USB\\VID_1949&PID_9981\\${COLORSOFT}`);
    expect(await kindlesOnUsb()).toEqual([{ serial: COLORSOFT, model: "colorsoft" }]);
  });

  it("skips the made-up ids of a device's parts", async () => {
    system.answer = answer(`USB\\VID_1949&PID_9981&MI_00\\6&2F3A&0&0000|USB\\VID_1949&PID_9981\\G0XAAA1`);
    expect((await kindlesOnUsb()).map((k) => k.serial)).toEqual(["G0XAAA1"]);
  });

  it("finds nothing with nothing plugged in, or PowerShell missing", async () => {
    system.answer = answer("");
    expect(await kindlesOnUsb()).toEqual([]);
    system.answer = new Error("powershell.exe not found");
    expect(await kindlesOnUsb()).toEqual([]);
  });

  it("only tries the drives Windows lists, and they aren't Kindles without their folders", async () => {
    system.answer = answer("USB\\VID_1949&PID_9981\\G0XAAA1", "Y:|Z:");
    expect(await findDevices()).toEqual([]);
  });
});

describe("a whole look at the port", () => {
  const backend = {
    storages: async () => [{ id: "s", name: "Internal", capacity: 10, free: 7 }],
    close: async () => void closed.count++,
  } as unknown as Backend;
  const closed = { count: 0 };

  beforeEach(() => {
    closed.count = 0;
    setConnector(async () => ({ backend }));
  });

  it("opens a Kindle that's only on USB, and offers it as a device", async () => {
    system.answer = ioreg({ vendor: 6473, serial: COLORSOFT });
    const first = await kindlePort();
    expect(first.usb[0].link).toBe("opening");
    expect(first.drives).toEqual([]);
    await vi.waitFor(async () => expect((await kindlePort()).drives.length).toBe(1));
    const { usb, drives } = await kindlePort();
    expect(usb[0].link).toBe("ready");
    expect(drives[0]).toMatchObject({ path: `mtp:${COLORSOFT}`, free: 7, name: "Kindle Colorsoft", model: "colorsoft" });
    expect(await isPluggedIn(drives[0].path)).toBe(true);
    expect((await findDevices()).map((d) => d.path)).toEqual([`mtp:${COLORSOFT}`]);
  });

  it("forgets a Kindle once it's gone", async () => {
    system.answer = ioreg({ vendor: 6473, serial: COLORSOFT });
    await kindlePort();
    await vi.waitFor(async () => expect((await kindlePort()).drives.length).toBe(1));
    system.answer = ioreg();
    expect(await kindlePort()).toEqual({ usb: [], drives: [] });
    await vi.waitFor(() => expect(closed.count).toBe(1));
    expect(await isPluggedIn(`mtp:${COLORSOFT}`)).toBe(false);
  });

  it("shares one look between everyone asking at once", async () => {
    system.answer = ioreg();
    await Promise.all([kindlePort(), kindlePort(), kindlePort()]);
    expect(system.asked).toBe(1);
  });

  describe("with a drive", () => {
    let drive: string;
    beforeEach(() => {
      drive = mkdtempSync(join(tmpdir(), "shelf-bus-"));
      mkdirSync(join(drive, "documents"));
      mkdirSync(join(drive, "system"));
    });
    afterEach(() => rmSync(drive, { recursive: true, force: true }));

    it("uses it, and leaves the Kindle's MTP alone", async () => {
      const connector = vi.fn(async () => ({ backend }));
      setConnector(connector);
      system.answer = ioreg({ vendor: 6473, serial: COLORSOFT });
      // /Volumes is read as a list of names, so this reaches the folder from there.
      system.volumes = [relative("/Volumes", drive)];
      const { usb, drives } = await kindlePort();
      expect(drives.map((d) => d.path)).toEqual([join("/Volumes", relative("/Volumes", drive))]);
      expect(usb[0].link).toBeUndefined();
      await new Promise((r) => setTimeout(r, 10));
      expect(connector).not.toHaveBeenCalled();
    });

    it("remembers it, so checking a path doesn't mean asking the system again", async () => {
      system.answer = ioreg({ vendor: 6473, serial: COLORSOFT });
      system.volumes = [relative("/Volumes", drive)];
      const { drives } = await kindlePort();
      const asked = system.asked;
      expect(await isPluggedIn(drives[0].path)).toBe(true);
      expect(system.asked).toBe(asked);
    });

    it("lets go of the MTP connection when the Kindle turns up as a drive instead", async () => {
      system.answer = ioreg({ vendor: 6473, serial: COLORSOFT });
      await kindlePort();
      await vi.waitFor(async () => expect((await kindlePort()).drives.length).toBe(1));
      system.volumes = [relative("/Volumes", drive)];
      const { drives } = await kindlePort();
      expect(drives[0].path.startsWith("mtp:")).toBe(false);
      await vi.waitFor(() => expect(closed.count).toBe(1));
    });
  });
});
