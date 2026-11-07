import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KindleBusy, MtpKindle, NoMtp } from "../src/main/mtp/kindle";
import { PretendKindle } from "../src/main/mtp/pretend";

const devices: FakeDevice[] = [];
vi.mock("usb", () => ({ usb: { getDevices: async () => devices } }));
const { connectUsb } = await import("../src/main/mtp/usb");

const SERIAL = "G000TEST";
const bulk = (direction: string, endpointNumber: number) => ({ endpointNumber, direction, type: "bulk", packetSize: 512 });
const event = { endpointNumber: 3, direction: "in", type: "interrupt", packetSize: 64 };
const MTP_ENDPOINTS = [bulk("in", 1), bulk("out", 2), event];

const face = (interfaceNumber: number, interfaceClass: number, interfaceSubclass: number, endpoints: object[], interfaceName?: string) => {
  const alternate = { alternateSetting: 0, interfaceClass, interfaceSubclass, interfaceProtocol: 1, interfaceName, endpoints };
  return { interfaceNumber, claimed: false, alternate, alternates: [alternate] };
};

class FakeDevice {
  vendorId = 0x1949;
  productId = 0x9981;
  serialNumber = SERIAL;
  calls: string[] = [];
  configuration: { configurationValue: number; interfaces: object[] } | null;
  configurations: Array<{ configurationValue: number; interfaces: object[] }>;
  claimFails = false;
  /** Makes reads stall, and writes come up short, from this many bytes on. */
  stall = false;
  shortWrites = false;
  backend: PretendKindle;

  constructor(root: string, interfaces: object[], configured = true) {
    this.configurations = [{ configurationValue: 1, interfaces }];
    this.configuration = configured ? this.configurations[0] : null;
    this.backend = new PretendKindle(root);
  }
  async open() {
    this.calls.push("open");
  }
  async close() {
    this.calls.push("close");
  }
  async selectConfiguration(value: number) {
    this.calls.push(`config ${value}`);
    this.configuration = this.configurations[0];
  }
  async claimInterface(number: number) {
    if (this.claimFails) throw new Error("exclusive access");
    this.calls.push(`claim ${number}`);
  }
  async releaseInterface(number: number) {
    this.calls.push(`release ${number}`);
  }
  async nativeControlTransferOut(setup: { request: number; index: number }) {
    this.calls.push(`control ${setup.request.toString(16)} ${setup.index}`);
    return 0;
  }
  async clearHalt(direction: string, endpoint: number) {
    this.calls.push(`halt ${direction} ${endpoint}`);
  }
  async nativeTransferOut(endpoint: number, _timeout: number, data: Uint8Array) {
    expect(endpoint).toBe(2);
    await this.backend.write(data);
    return this.shortWrites ? Math.max(0, data.length - 1) : data.length;
  }
  async nativeTransferIn(endpoint: number, _timeout: number, length: number) {
    expect(endpoint).toBe(1);
    expect(length % 512).toBe(0);
    if (this.stall) return null;
    return this.backend.read(length);
  }
}

let dir: string;
let root: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shelf-usb-"));
  root = join(dir, "kindle");
  mkdirSync(join(root, "documents"), { recursive: true });
  devices.length = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const plug = (interfaces: object[], configured = true) => {
  const device = new FakeDevice(root, interfaces, configured);
  devices.push(device);
  return device;
};

describe("finding MTP on a Kindle", () => {
  it("takes the still-image interface", async () => {
    const device = plug([face(0, 8, 6, [bulk("in", 9), bulk("out", 9)]), face(4, 6, 1, MTP_ENDPOINTS)]);
    await connectUsb(SERIAL, false);
    expect(device.calls).toContain("claim 4");
  });

  it("takes a vendor interface that names itself MTP", async () => {
    const device = plug([face(0, 0xff, 0x42, [bulk("in", 9), bulk("out", 9)], "ADB Interface"), face(2, 0xff, 0xff, [bulk("in", 1), bulk("out", 2)], "MTP")]);
    await connectUsb(SERIAL, false);
    expect(device.calls).toContain("claim 2");
  });

  it("takes an unnamed vendor interface with an event pipe, but never the debug bridge", async () => {
    const device = plug([face(0, 0xff, 0x42, [bulk("in", 9), bulk("out", 9), event]), face(1, 0xff, 0xff, MTP_ENDPOINTS)]);
    await connectUsb(SERIAL, false);
    expect(device.calls).toContain("claim 1");
  });

  it("says a Kindle that's only a drive has no MTP, and doesn't touch it", async () => {
    const device = plug([face(0, 8, 6, [bulk("in", 1), bulk("out", 2)])]);
    await expect(connectUsb(SERIAL, false)).rejects.toBeInstanceOf(NoMtp);
    expect(device.calls).toEqual([]);
  });

  it("ignores an interface with no way to send and receive", async () => {
    plug([face(0, 6, 1, [event])]);
    await expect(connectUsb(SERIAL, false)).rejects.toBeInstanceOf(NoMtp);
  });

  it("only takes the Kindle it was asked for, and only Amazon's", async () => {
    plug([face(0, 6, 1, MTP_ENDPOINTS)]).serialNumber = "OTHER";
    const phone = plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    phone.vendorId = 0x18d1;
    await expect(connectUsb(SERIAL, false)).rejects.toThrow("isn't on the USB bus");
    expect(phone.calls).toEqual([]);
  });
});

describe("opening it", () => {
  it("sets a configuration only if it has none", async () => {
    const fresh = plug([face(0, 6, 1, MTP_ENDPOINTS)], false);
    await connectUsb(SERIAL, false);
    expect(fresh.calls.slice(0, 3)).toEqual(["open", "config 1", "claim 0"]);
    devices.length = 0;
    const ready = plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    await connectUsb(SERIAL, false);
    expect(ready.calls.some((c) => c.startsWith("config"))).toBe(false);
  });

  it("calls a Kindle it can't claim busy, and closes what it opened", async () => {
    const device = plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    device.claimFails = true;
    await expect(connectUsb(SERIAL, false)).rejects.toBeInstanceOf(KindleBusy);
    expect(device.calls).toEqual(["open", "close"]);
  });

  it("asks the device to start over after a bad ending, without a USB reset", async () => {
    const device = plug([face(5, 6, 1, MTP_ENDPOINTS)]);
    await connectUsb(SERIAL, true);
    expect(device.calls).toEqual(expect.arrayContaining(["control 66 5", "halt in 1", "halt out 2"]));
  });

  it("doesn't do that after a good ending", async () => {
    const device = plug([face(5, 6, 1, MTP_ENDPOINTS)]);
    await connectUsb(SERIAL, false);
    expect(device.calls.some((c) => c.startsWith("control") || c.startsWith("halt"))).toBe(false);
  });

  it("lets go of the device if the session won't start", async () => {
    const device = plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    device.stall = true;
    await expect(connectUsb(SERIAL, false)).rejects.toThrow("stalled");
    expect(device.calls.slice(-2)).toEqual(["release 0", "close"]);
  });
});

describe("talking to it", () => {
  it("works through the whole stack, from a book to the Kindle's storage and back", async () => {
    plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    const { backend } = await connectUsb(SERIAL, false);
    const kindle = new MtpKindle(backend);
    const bytes = Buffer.alloc(700_000, 4);
    const file = join(dir, "Dune.azw3");
    writeFileSync(file, bytes);
    await kindle.put(file, "Dune.azw3", bytes.length);
    expect(readFileSync(join(root, "documents", "Dune.azw3")).equals(bytes)).toBe(true);
    expect((await kindle.files()).map((f) => f.path)).toEqual(["Dune.azw3"]);
    const back = join(dir, "back.azw3");
    await kindle.get("Dune.azw3", back);
    expect(readFileSync(back).equals(bytes)).toBe(true);
    expect(await kindle.remove(["Dune.azw3"])).toBe(bytes.length);
  });

  it("says what the device is for a report, without its serial", async () => {
    plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    const { about } = await connectUsb(SERIAL, false);
    expect(about).toContain("Amazon Kindle");
    expect(about).toContain("1949:9981");
    expect(about).toContain("interface 6/1");
    expect(about).not.toContain(SERIAL);
  });

  it("closes its session, then releases and closes the device", async () => {
    const device = plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    const { backend } = await connectUsb(SERIAL, false);
    await backend.close();
    expect(device.calls.slice(-2)).toEqual(["release 0", "close"]);
  });

  it("lets go of the device even if the Kindle won't answer the goodbye", async () => {
    const device = plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    const { backend } = await connectUsb(SERIAL, false);
    device.stall = true;
    await backend.close();
    expect(device.calls.slice(-2)).toEqual(["release 0", "close"]);
  });

  it("treats a stall as an error, not as an empty answer", async () => {
    const device = plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    const { backend } = await connectUsb(SERIAL, false);
    device.stall = true;
    await expect(new MtpKindle(backend).space()).rejects.toThrow("stalled");
  });

  it("treats a write that came up short as an error", async () => {
    const device = plug([face(0, 6, 1, MTP_ENDPOINTS)]);
    const { backend } = await connectUsb(SERIAL, false);
    device.shortWrites = true;
    await expect(new MtpKindle(backend).space()).rejects.toThrow("took");
  });
});
