import { KindleBusy, NoMtp } from "./kindle";
import type { Pipe } from "./protocol";
import { SessionBackend } from "./session-backend";

/*
 * Reaching a Kindle over USB directly, for systems that let a program do that:
 * macOS, and Linux with the right permissions. The usb package talks to the
 * system's own USB service, and everything above it is Shelfed's.
 */

const AMAZON = 0x1949;
/** A big file can make a Kindle think for a while before it answers. */
const TIMEOUT = 60_000;
/** The request that tells a still-image device to drop what it was doing. */
const DEVICE_RESET = 0x66;

type Endpoint = { endpointNumber: number; direction: string; type: string; packetSize: number };
type Alternate = { interfaceClass: number; interfaceSubclass: number; interfaceProtocol: number; interfaceName?: string; endpoints: Endpoint[] };
type Device = Awaited<ReturnType<(typeof import("usb"))["usb"]["getDevices"]>>[number];

/** The interface MTP lives on: the still-image class, or a vendor one that says it's MTP. */
function mtpInterface(device: Device) {
  const interfaces = (device.configuration ?? device.configurations[0])?.interfaces ?? [];
  const usable = [...interfaces]
    .map((face) => ({ number: face.interfaceNumber, alternate: (face.alternate ?? face.alternates[0]) as unknown as Alternate }))
    .filter(({ alternate }) => alternate?.endpoints.some((e) => e.type === "bulk" && e.direction === "in") && alternate.endpoints.some((e) => e.type === "bulk" && e.direction === "out"));
  return (
    usable.find(({ alternate }) => alternate.interfaceClass === 6 && alternate.interfaceSubclass === 1) ??
    usable.find(({ alternate }) => /mtp/i.test(alternate.interfaceName ?? "")) ??
    // A vendor interface with an event pipe beside its bulk pipes, and not the debug bridge (0x42).
    usable.find(({ alternate }) => alternate.interfaceClass === 0xff && alternate.interfaceSubclass !== 0x42 && alternate.endpoints.some((e) => e.type === "interrupt"))
  );
}

/** Opens the Kindle with this serial and starts a session. */
export async function connectUsb(serial: string, afterFailure: boolean) {
  const library = await import("usb");
  // Depending on how it's loaded, the package's exports may sit under default.
  const usb = library.usb ?? (library as unknown as { default: typeof library }).default.usb;
  const device = (await usb.getDevices()).find((d) => d.vendorId === AMAZON && (d.serialNumber ?? "") === serial);
  if (!device) throw new Error("That Kindle isn't on the USB bus any more");
  const face = mtpInterface(device);
  if (!face) throw new NoMtp();
  const claim = async () => {
    await device.open();
    const wanted = device.configurations[0]?.configurationValue ?? 1;
    if (!device.configuration) await device.selectConfiguration(wanted);
    await device.claimInterface(face.number);
  };
  try {
    await claim();
  } catch (error) {
    await device.close().catch(() => {});
    throw new KindleBusy((error as Error).message);
  }
  const number = (e?: Endpoint) => e?.endpointNumber ?? 0;
  const endpoints = face.alternate.endpoints;
  const out = endpoints.find((e) => e.type === "bulk" && e.direction === "out")!;
  const into = endpoints.find((e) => e.type === "bulk" && e.direction === "in")!;
  if (afterFailure) {
    // The last conversation ended badly, so the device may still be waiting for the rest of it.
    // A full USB reset would make it reconnect and lose this connection, so ask it to start over instead.
    await device.nativeControlTransferOut({ requestType: "class", recipient: "interface", request: DEVICE_RESET, value: 0, index: face.number }, 5000).catch(() => {});
    await device.clearHalt("in", number(into)).catch(() => {});
    await device.clearHalt("out", number(out)).catch(() => {});
  }
  const pipe: Pipe = {
    packetSize: into.packetSize || 512,
    async write(data) {
      const written = await device.nativeTransferOut(number(out), TIMEOUT, data);
      if (written !== data.length) throw new Error(`The Kindle took ${written} of ${data.length} bytes`);
    },
    async read(max) {
      const data = await device.nativeTransferIn(number(into), TIMEOUT, max);
      // Nothing at all, as opposed to an empty packet, is the device refusing the pipe.
      if (!data) throw new Error("The Kindle stalled");
      return data;
    },
  };
  const finish = async () => {
    await device.releaseInterface(face.number).catch(() => {});
    await device.close().catch(() => {});
  };
  try {
    const { backend, info } = await SessionBackend.start(pipe, finish);
    const about = `${info.manufacturer} ${info.model} ${info.version}, USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}, interface ${face.alternate.interfaceClass}/${face.alternate.interfaceSubclass}, operations ${info.operations.map((op) => op.toString(16)).join(" ")}`;
    return { backend, about };
  } catch (error) {
    await finish();
    throw error;
  }
}
