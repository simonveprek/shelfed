/*
 * MTP, the way Kindles from 2024 on talk over USB, written from the protocol's
 * public description and nothing else. A computer sends a command, then maybe
 * some data, and the device answers with maybe some data and always a response.
 * Everything here is about bytes, so it runs the same against a real Kindle and
 * against the pretend one the tests use.
 */

/** One way of reaching a device: a bulk pipe out, a bulk pipe in. */
export interface Pipe {
  /** The size of a USB packet, which decides where a transfer has to be padded out. */
  packetSize: number;
  write(data: Uint8Array): Promise<void>;
  /** Up to max bytes, or nothing at all when the device ends a transfer with an empty packet. */
  read(max: number): Promise<Uint8Array>;
}

export const OP = {
  GetDeviceInfo: 0x1001,
  OpenSession: 0x1002,
  CloseSession: 0x1003,
  GetStorageIDs: 0x1004,
  GetStorageInfo: 0x1005,
  GetObjectHandles: 0x1007,
  GetObjectInfo: 0x1008,
  GetObject: 0x1009,
  DeleteObject: 0x100b,
  SendObjectInfo: 0x100c,
  SendObject: 0x100d,
  GetPartialObject: 0x101b,
} as const;

export const RC = {
  OK: 0x2001,
  GeneralError: 0x2002,
  SessionNotOpen: 0x2003,
  OperationNotSupported: 0x2005,
  ParameterNotSupported: 0x2006,
  InvalidStorageID: 0x2008,
  InvalidObjectHandle: 0x2009,
  StoreFull: 0x200c,
  StoreNotAvailable: 0x2013,
  DeviceBusy: 0x2019,
  InvalidParentObject: 0x201a,
  SessionAlreadyOpen: 0x201e,
} as const;

const COMMAND = 1;
const DATA = 2;
const RESPONSE = 3;
const HEADER = 12;
/** The parent that means the top of a storage. */
export const ROOT = 0xffffffff;
/** A size that says the real one doesn't fit in the field. */
const UNKNOWN = 0xffffffff;
/** How much to ask for at a time. A whole number of packets at any USB speed. */
const READ = 256 * 1024;
/** The most a device may say about anything but a file's contents, so it can't run this computer out of memory. */
const MOST_DATA = 16 * 1024 * 1024;
/** A response holds at most five parameters. */
const MOST_RESPONSE = 5 * 4;
/** The most containers one transaction may answer with before its response. */
const MOST_CONTAINERS = 4;

export const FORMAT_UNDEFINED = 0x3000;
export const FORMAT_FOLDER = 0x3001;

/** A device saying no, with its response code. */
export class MtpError extends Error {
  constructor(
    readonly code: number,
    readonly operation: number,
  ) {
    super(`MTP operation 0x${operation.toString(16)} answered 0x${code.toString(16)}`);
  }
}

/** A string as MTP writes one: a count of UTF-16 units with the ending NUL, then the units. */
export function encodeString(text: string) {
  // The count is one byte, so a longer name can't be said at all.
  const units = text.slice(0, 254);
  if (!units) return Buffer.from([0]);
  const out = Buffer.alloc(1 + (units.length + 1) * 2);
  out[0] = units.length + 1;
  out.write(units, 1, "utf16le");
  return out;
}

/** Reads a dataset from the front to the back, giving back nothing rather than running off the end. */
export class Reader {
  at = 0;
  constructor(private bytes: Buffer) {}
  u16() {
    const value = this.at + 2 <= this.bytes.length ? this.bytes.readUInt16LE(this.at) : 0;
    this.at += 2;
    return value;
  }
  u32() {
    const value = this.at + 4 <= this.bytes.length ? this.bytes.readUInt32LE(this.at) : 0;
    this.at += 4;
    return value;
  }
  u64() {
    const value = this.at + 8 <= this.bytes.length ? Number(this.bytes.readBigUInt64LE(this.at)) : 0;
    this.at += 8;
    return value;
  }
  string() {
    const count = this.at < this.bytes.length ? this.bytes[this.at] : 0;
    this.at += 1;
    if (!count) return "";
    const text = this.bytes.toString("utf16le", this.at, Math.min(this.at + count * 2, this.bytes.length));
    this.at += count * 2;
    return text.replace(/\0+$/, "");
  }
  u32s() {
    const count = this.u32();
    const out: number[] = [];
    for (let i = 0; i < count && this.at < this.bytes.length; i++) out.push(this.u32());
    return out;
  }
}

export type DeviceInfo = { manufacturer: string; model: string; version: string; serial: string; operations: number[] };

export function parseDeviceInfo(bytes: Buffer): DeviceInfo {
  const r = new Reader(bytes);
  r.u16(); // standard version
  r.u32(); // vendor extension id
  r.u16(); // vendor extension version
  r.string(); // vendor extension description
  r.u16(); // functional mode
  const operations = (() => {
    const count = r.u32();
    const out: number[] = [];
    for (let i = 0; i < count && r.at < bytes.length; i++) out.push(r.u16());
    return out;
  })();
  // Events, device properties, and the formats going each way: four more lists of the same shape.
  for (let list = 0; list < 4; list++) {
    const count = r.u32();
    r.at += count * 2;
  }
  return { manufacturer: r.string(), model: r.string(), version: r.string(), serial: r.string(), operations };
}

export type StorageInfo = { capacity: number; free: number; description: string; volume: string };

export function parseStorageInfo(bytes: Buffer): StorageInfo {
  const r = new Reader(bytes);
  r.u16(); // storage type
  r.u16(); // filesystem type
  r.u16(); // access capability
  const capacity = r.u64();
  const free = r.u64();
  r.u32(); // free space in objects
  return { capacity, free, description: r.string(), volume: r.string() };
}

export type ObjectInfo = { storage: number; format: number; size: number; parent: number; name: string };

export function parseObjectInfo(bytes: Buffer): ObjectInfo {
  const r = new Reader(bytes);
  const storage = r.u32();
  const format = r.u16();
  r.u16(); // protection
  const size = r.u32();
  r.u16(); // thumbnail format
  r.at += 6 * 4; // thumbnail size and dimensions, image dimensions, bit depth
  const parent = r.u32();
  r.u16(); // association type
  r.u32(); // association description
  r.u32(); // sequence number
  return { storage, format, size, parent, name: r.string() };
}

/** What SendObjectInfo says about a file or a folder that's about to exist. */
export function encodeObjectInfo(info: { storage: number; parent: number; format: number; size: number; name: string }) {
  const head = Buffer.alloc(52);
  head.writeUInt32LE(info.storage, 0);
  head.writeUInt16LE(info.format, 4);
  // A size too big for the field says so, and the device goes by what arrives.
  head.writeUInt32LE(Math.min(info.size, UNKNOWN), 8);
  head.writeUInt32LE(info.parent, 38);
  // A folder says it's a generic one. Everything else in here stays zero.
  if (info.format === FORMAT_FOLDER) head.writeUInt16LE(1, 42);
  // The dates and keywords after the name stay empty: some devices trip on a date they're given.
  return Buffer.concat([head, encodeString(info.name), Buffer.from([0, 0, 0])]);
}

const container = (type: number, code: number, transaction: number, params: number[]) => {
  const out = Buffer.alloc(HEADER + params.length * 4);
  out.writeUInt32LE(out.length, 0);
  out.writeUInt16LE(type, 4);
  out.writeUInt16LE(code, 6);
  out.writeUInt32LE(transaction, 8);
  params.forEach((param, i) => out.writeUInt32LE(param >>> 0, HEADER + i * 4));
  return out;
};

/**
 * Writes so that only the very last write can be short. A short write ends a
 * USB transfer, so a header on its own, or a half-full chunk in the middle,
 * would tell the device the data was over.
 */
class Outgoing {
  private held: Buffer = Buffer.alloc(0);
  private total = 0;
  constructor(private pipe: Pipe) {}
  async push(bytes: Uint8Array) {
    this.total += bytes.length;
    const size = this.pipe.packetSize;
    const all = this.held.length ? Buffer.concat([this.held, bytes]) : Buffer.from(bytes);
    const whole = all.length - (all.length % size);
    if (whole) await this.pipe.write(all.subarray(0, whole));
    this.held = all.subarray(whole);
  }
  async end() {
    if (this.held.length) await this.pipe.write(this.held);
    // Exactly full packets don't end a transfer by themselves, an empty one does.
    else if (this.total % this.pipe.packetSize === 0) await this.pipe.write(new Uint8Array(0));
    this.held = Buffer.alloc(0);
  }
}

type Reply = { code: number; params: number[] };

/** Where incoming data goes, a chunk at a time, in order. Throwing stops the transfer. */
type Sink = (chunk: Buffer) => void | Promise<void>;

/** A sink that refuses more than this many bytes, whatever the device says it's sending. */
function limited(most: number, sink: Sink): Sink {
  let total = 0;
  return (chunk) => {
    total += chunk.length;
    if (total > most) throw new Error("The device sent more than it should have");
    return sink(chunk);
  };
}

/**
 * A session with one device. Transactions run one at a time; call them one
 * after another. Once one fails halfway the pipe can't be trusted, so the
 * owner closes the connection and starts again.
 */
export class Session {
  private transaction = 0;
  /** Whether this program has a session open. Outside one, every transaction is number 0. */
  private opened = false;
  /** Bytes read past the end of what was asked for, for a device that doesn't end its transfers. */
  private spare: Buffer = Buffer.alloc(0);

  constructor(private pipe: Pipe) {}

  private async pull(): Promise<Buffer> {
    if (this.spare.length) {
      const bytes = this.spare;
      this.spare = Buffer.alloc(0);
      return bytes;
    }
    return Buffer.from(await this.pipe.read(READ));
  }

  /** A container's header, however the device split it up, with whatever arrived behind it. */
  private async header() {
    let bytes: Buffer = Buffer.alloc(0);
    // Empty packets from the end of the last transfer don't count, but only so many of them.
    let empties = 0;
    while (bytes.length < HEADER) {
      const more = await this.pull();
      if (!more.length && ++empties > 4) throw new Error("The device stopped answering");
      bytes = bytes.length ? Buffer.concat([bytes, more]) : more;
    }
    return { length: bytes.readUInt32LE(0), type: bytes.readUInt16LE(4), code: bytes.readUInt16LE(6), transaction: bytes.readUInt32LE(8), rest: bytes.subarray(HEADER) };
  }

  private async drain(length: number, rest: Buffer, sink: Sink) {
    const open = length === UNKNOWN;
    let left = open ? Infinity : length - HEADER;
    let chunk = rest;
    while (left > 0) {
      const take = Math.min(left, chunk.length);
      if (take) await sink(chunk.subarray(0, take));
      left -= take;
      if (take < chunk.length) this.spare = chunk.subarray(take);
      if (left <= 0) break;
      const next = Buffer.from(await this.pipe.read(READ));
      // A size too big to say ends where the device's transfer ends.
      if (open && (!next.length || next.length % this.pipe.packetSize !== 0)) {
        if (next.length) await sink(next);
        break;
      }
      if (!next.length && !open) throw new Error("The device stopped part way through");
      chunk = next;
    }
  }

  private async run(operation: number, params: number[], send?: { size: number; chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array> }, sink?: Sink): Promise<Reply> {
    // Outside a session a transaction is always number 0, as the standard says, and a real Kindle
    // turns down anything else. A session's opening is 0 too, and its transactions count from 1.
    const transaction = operation === OP.OpenSession || !this.opened ? (this.transaction = 0) : ++this.transaction;
    await this.pipe.write(container(COMMAND, operation, transaction, params));
    if (send) {
      const out = new Outgoing(this.pipe);
      const head = container(DATA, operation, transaction, []);
      const length = HEADER + send.size;
      head.writeUInt32LE(length >= UNKNOWN ? UNKNOWN : length, 0);
      await out.push(head);
      for await (const chunk of send.chunks) await out.push(chunk);
      await out.end();
    }
    for (let containers = 0; ; containers++) {
      if (containers > MOST_CONTAINERS) throw new Error("The device won't stop answering");
      const got = await this.header();
      if (got.length < HEADER) throw new Error("The device sent a broken answer");
      if (got.type !== RESPONSE) {
        // Data nobody asked for, or anything else on this pipe, is read past and never kept.
        await this.drain(got.length, got.rest, got.type === DATA && sink ? sink : limited(MOST_DATA, () => {}));
        continue;
      }
      const size = got.length - HEADER;
      if (size > MOST_RESPONSE) throw new Error("The device sent a broken answer");
      // The parameters can come in a read of their own, after the header.
      let rest = got.rest;
      while (rest.length < size) {
        const more = await this.pull();
        if (!more.length) throw new Error("The device stopped part way through an answer");
        rest = Buffer.concat([rest, more]);
      }
      const params = new Reader(rest.subarray(0, size));
      const answered = Array.from({ length: Math.floor(size / 4) }, () => params.u32());
      if (rest.length > size) this.spare = rest.subarray(size);
      return { code: got.code, params: answered };
    }
  }

  /** Runs a transaction whose data can be sent again, trying again while the device says it's busy. */
  private async ask(operation: number, params: number[] = [], sink?: Sink, allow: number[] = [], send?: { size: number; chunks: Iterable<Uint8Array> }): Promise<Reply> {
    for (let attempt = 0; ; attempt++) {
      const reply = await this.run(operation, params, send, sink);
      if (reply.code === RC.OK || allow.includes(reply.code)) return reply;
      if (reply.code !== RC.DeviceBusy || attempt >= 8) throw new MtpError(reply.code, operation);
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }

  private async fetch(operation: number, params: number[] = [], most = MOST_DATA) {
    const parts: Buffer[] = [];
    await this.ask(operation, params, limited(most, (chunk) => void parts.push(Buffer.from(chunk))));
    return Buffer.concat(parts);
  }

  async deviceInfo() {
    return parseDeviceInfo(await this.fetch(OP.GetDeviceInfo));
  }

  /** Starts the session. One left open by a program that didn't close it is taken over. */
  async open() {
    await this.ask(OP.OpenSession, [1], undefined, [RC.SessionAlreadyOpen]);
    this.opened = true;
  }

  async close() {
    await this.ask(OP.CloseSession);
    this.opened = false;
  }

  async storageIds() {
    // The low half of an id being zero is a slot with nothing in it.
    return new Reader(await this.fetch(OP.GetStorageIDs)).u32s().filter((id) => (id & 0xffff) !== 0);
  }

  async storageInfo(storage: number) {
    return parseStorageInfo(await this.fetch(OP.GetStorageInfo, [storage]));
  }

  async handles(storage: number, parent: number) {
    return new Reader(await this.fetch(OP.GetObjectHandles, [storage, 0, parent])).u32s();
  }

  async objectInfo(handle: number) {
    return parseObjectInfo(await this.fetch(OP.GetObjectInfo, [handle]));
  }

  /** A whole file, to wherever the sink puts it. */
  async getObject(handle: number, sink: Sink) {
    await this.ask(OP.GetObject, [handle], sink);
  }

  /** Part of a file. */
  async getPartial(handle: number, offset: number, length: number) {
    return this.fetch(OP.GetPartialObject, [handle, offset, length], length);
  }

  async remove(handle: number) {
    await this.ask(OP.DeleteObject, [handle, 0]);
  }

  /** Announces a file or folder. Gives back the handle it will have. */
  async sendInfo(info: { storage: number; parent: number; format: number; size: number; name: string }) {
    const dataset = encodeObjectInfo(info);
    const reply = await this.ask(OP.SendObjectInfo, [info.storage, info.parent], undefined, [], { size: dataset.length, chunks: [dataset] });
    return reply.params[2];
  }

  /** The bytes of the file sendInfo just announced. */
  async send(size: number, chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>) {
    const reply = await this.run(OP.SendObject, [], { size, chunks });
    if (reply.code !== RC.OK) throw new MtpError(reply.code, OP.SendObject);
  }
}
