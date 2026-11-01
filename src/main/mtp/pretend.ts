import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { encodeString, FORMAT_FOLDER, FORMAT_UNDEFINED, OP, RC, Reader, ROOT, type Pipe } from "./protocol";

/*
 * A pretend Kindle that speaks real MTP, with a folder for its storage. The
 * tests and the demo Kindle talk to it through the same code that talks to a
 * real one, so everything but the USB cable gets exercised. It's strict about
 * the things a real device can be strict about, and can be told to behave
 * like the awkward ones.
 */

const STORAGE = 0x00010001;
const OUT_OF_ORDER = "Pretend Kindle: ";

export type Quirks = {
  packetSize?: number;
  /** Says it's busy this many times before answering anything. */
  busy?: number;
  /** Doesn't send the empty packet after data that exactly fills its packets. */
  noEmptyPackets?: boolean;
  /** Hands over the header of each answer on its own. */
  splitHeaders?: boolean;
  /** Fills up after this many bytes. */
  capacity?: number;
  /** Stops halfway through receiving a file, as if unplugged. */
  dropsAfter?: number;
  /** Doesn't offer GetPartialObject. */
  noPartial?: boolean;
  /** A session someone else left open. */
  sessionLeftOpen?: boolean;
  /** Says a file arrived fine while keeping only part of it. */
  losesBytes?: boolean;
  /** Takes in a file's data, then refuses it. */
  refusesFiles?: boolean;
  /** Says a file is this size, whatever it really is. */
  claimsSize?: number;
  /** Offers no storage this many times, as a Kindle just plugged in can. */
  noStorageYet?: number;
  /** Says its storage isn't available this many times. */
  storageUnavailable?: number;
};

export class PretendKindle implements Pipe {
  readonly packetSize: number;
  sessions = 0;
  /** The answer the next command gets, whatever it was. */
  failNext = 0;
  /** What was asked, in order, for the tests to check. */
  log: number[] = [];

  private next = 2;
  private paths = new Map<number, string>();
  private ids = new Map<string, number>();
  private busy: number;
  private open: boolean;
  private noStorageYet: number;
  private storageUnavailable: number;
  private transfers: Buffer[] = [];
  private incoming: Buffer = Buffer.alloc(0);
  private incomingLength = 0;
  private expectEmpty = false;
  private pendingCommand: { code: number; transaction: number; params: number[] } | null = null;
  private announced: { parent: string; name: string; size: number; folder: boolean; id: number } | null = null;
  private received = 0;

  constructor(
    private root: string,
    private quirks: Quirks = {},
  ) {
    this.packetSize = quirks.packetSize ?? 512;
    this.busy = quirks.busy ?? 0;
    this.open = Boolean(quirks.sessionLeftOpen);
    this.noStorageYet = quirks.noStorageYet ?? 0;
    this.storageUnavailable = quirks.storageUnavailable ?? 0;
    mkdirSync(root, { recursive: true });
  }

  /** Says it's busy this many more times. */
  setBusy(times: number) {
    this.busy = times;
  }

  private idOf(path: string) {
    let id = this.ids.get(path);
    if (!id) {
      id = this.next++;
      this.ids.set(path, id);
      this.paths.set(id, path);
    }
    return id;
  }

  private queue(type: number, code: number, transaction: number, body: Buffer) {
    const head = Buffer.alloc(12);
    head.writeUInt32LE(12 + body.length, 0);
    head.writeUInt16LE(type, 4);
    head.writeUInt16LE(code, 6);
    head.writeUInt32LE(transaction, 8);
    if (this.quirks.splitHeaders) {
      // In two transfers' worth of reads, as some devices hand them over.
      this.transfers.push(head.subarray(0, 12), body);
      return;
    }
    this.transfers.push(Buffer.concat([head, body]));
  }

  private respond(code: number, transaction: number, params: number[] = []) {
    const body = Buffer.alloc(params.length * 4);
    params.forEach((p, i) => body.writeUInt32LE(p >>> 0, i * 4));
    this.queue(3, code, transaction, body);
  }

  async write(data: Uint8Array) {
    const bytes = Buffer.from(data);
    if (this.expectEmpty) {
      if (bytes.length) throw new Error(`${OUT_OF_ORDER}data that exactly filled its packets wasn't ended by an empty one`);
      this.expectEmpty = false;
      return;
    }
    if (!bytes.length) throw new Error(`${OUT_OF_ORDER}an empty write it wasn't waiting for`);
    if (!this.incoming.length && !this.pendingCommand) {
      const length = bytes.readUInt32LE(0);
      const type = bytes.readUInt16LE(4);
      if (type !== 1 || length !== bytes.length) throw new Error(`${OUT_OF_ORDER}expected a command`);
      const reader = new Reader(bytes.subarray(12));
      const params = Array.from({ length: (length - 12) / 4 }, () => reader.u32());
      this.command(bytes.readUInt16LE(6), bytes.readUInt32LE(8), params);
      return;
    }
    // A data phase. Anything short that doesn't finish the container would end the transfer early.
    if (!this.incoming.length) {
      this.incomingLength = bytes.readUInt32LE(0);
      if (bytes.readUInt16LE(4) !== 2) throw new Error(`${OUT_OF_ORDER}expected data`);
    }
    this.incoming = Buffer.concat([this.incoming, bytes]);
    if (this.quirks.dropsAfter !== undefined && this.incoming.length > this.quirks.dropsAfter) throw new Error("Pretend Kindle: unplugged");
    const finished = this.incoming.length >= this.incomingLength;
    if (!finished && bytes.length % this.packetSize) throw new Error(`${OUT_OF_ORDER}a short write in the middle of data, which would end the transfer`);
    if (!finished) return;
    if (this.incomingLength % this.packetSize === 0) this.expectEmpty = true;
    const body = this.incoming.subarray(12, this.incomingLength);
    const command = this.pendingCommand!;
    this.incoming = Buffer.alloc(0);
    this.pendingCommand = null;
    this.data(command, body);
  }

  private command(code: number, transaction: number, params: number[]) {
    this.log.push(code);
    if (code === OP.SendObjectInfo || code === OP.SendObject) {
      this.pendingCommand = { code, transaction, params };
      return;
    }
    if (this.failNext) {
      const answer = this.failNext;
      this.failNext = 0;
      return this.respond(answer, transaction);
    }
    if (this.busy > 0 && code !== OP.GetDeviceInfo) {
      this.busy--;
      return this.respond(RC.DeviceBusy, transaction);
    }
    if (code === OP.GetDeviceInfo) return this.deviceInfo(transaction);
    if (code === OP.OpenSession) {
      if (this.open) return this.respond(RC.SessionAlreadyOpen, transaction);
      this.open = true;
      this.sessions++;
      return this.respond(RC.OK, transaction);
    }
    if (!this.open) return this.respond(RC.SessionNotOpen, transaction);
    if (code === OP.CloseSession) {
      this.open = false;
      return this.respond(RC.OK, transaction);
    }
    if (code === OP.GetStorageIDs) {
      if (this.noStorageYet > 0) {
        this.noStorageYet--;
        this.queue(2, code, transaction, Buffer.alloc(4));
        return this.respond(RC.OK, transaction);
      }
      // An empty slot first, which a program mustn't take for a storage.
      const body = Buffer.alloc(12);
      body.writeUInt32LE(2, 0);
      body.writeUInt32LE(0x00020000, 4);
      body.writeUInt32LE(STORAGE, 8);
      this.queue(2, code, transaction, body);
      return this.respond(RC.OK, transaction);
    }
    if (code === OP.GetStorageInfo) return this.storageInfo(transaction, params[0]);
    if (code === OP.GetObjectHandles) return this.objectHandles(transaction, params);
    if (code === OP.GetObjectInfo) return this.objectInfo(transaction, params[0]);
    if (code === OP.GetObject) {
      const path = this.paths.get(params[0]);
      if (!path || !existsSync(path)) return this.respond(RC.InvalidObjectHandle, transaction);
      this.queue(2, code, transaction, readFileSync(path));
      return this.respond(RC.OK, transaction);
    }
    if (code === OP.GetPartialObject) {
      if (this.quirks.noPartial) return this.respond(RC.OperationNotSupported, transaction);
      const path = this.paths.get(params[0]);
      if (!path || !existsSync(path)) return this.respond(RC.InvalidObjectHandle, transaction);
      this.queue(2, code, transaction, readFileSync(path).subarray(params[1], params[1] + params[2]));
      return this.respond(RC.OK, transaction);
    }
    if (code === OP.DeleteObject) {
      const path = this.paths.get(params[0]);
      if (!path || !existsSync(path)) return this.respond(RC.InvalidObjectHandle, transaction);
      rmSync(path, { recursive: true, force: true });
      this.paths.delete(params[0]);
      this.ids.delete(path);
      return this.respond(RC.OK, transaction);
    }
    return this.respond(RC.OperationNotSupported, transaction);
  }

  private data(command: { code: number; transaction: number; params: number[] }, body: Buffer) {
    if (command.code === OP.SendObjectInfo) {
      const r = new Reader(body);
      r.u32();
      const format = r.u16();
      r.u16();
      const size = r.u32();
      r.at = 38;
      r.u32();
      r.at = 52;
      const name = r.string();
      const parent = command.params[1];
      const parentPath = parent === ROOT ? this.root : this.paths.get(parent);
      if (!parentPath || !existsSync(parentPath)) return this.respond(RC.InvalidParentObject, command.transaction);
      const used = this.used();
      if (this.quirks.capacity !== undefined && used + size > this.quirks.capacity) return this.respond(RC.StoreFull, command.transaction);
      const path = join(parentPath, name);
      // Devices don't overwrite: a name that's taken has to be cleared first.
      if (existsSync(path)) return this.respond(RC.GeneralError, command.transaction);
      const id = this.idOf(path);
      if (format === FORMAT_FOLDER) {
        mkdirSync(path, { recursive: true });
        return this.respond(RC.OK, command.transaction, [STORAGE, parent, id]);
      }
      // The object exists from now on, empty, as it does on a real device, until its data comes.
      writeFileSync(path, "");
      this.announced = { parent: parentPath, name, size, folder: false, id };
      this.received = 0;
      return this.respond(RC.OK, command.transaction, [STORAGE, parent, id]);
    }
    if (command.code === OP.SendObject) {
      if (!this.announced) return this.respond(RC.GeneralError, command.transaction);
      const path = join(this.announced.parent, this.announced.name);
      mkdirSync(dirname(path), { recursive: true });
      this.received = body.length;
      const whole = this.received === this.announced.size;
      this.announced = null;
      if (this.quirks.refusesFiles) return this.respond(RC.StoreFull, command.transaction);
      if (this.quirks.losesBytes) {
        writeFileSync(path, body.subarray(0, Math.floor(body.length / 2)));
        return this.respond(RC.OK, command.transaction);
      }
      writeFileSync(path, body);
      return this.respond(whole ? RC.OK : RC.GeneralError, command.transaction);
    }
  }

  private used(dir = this.root): number {
    return readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? this.used(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
  }

  private deviceInfo(transaction: number) {
    const operations = Object.values(OP).filter((op) => !(this.quirks.noPartial && op === OP.GetPartialObject));
    const list = (values: number[]) => {
      const out = Buffer.alloc(4 + values.length * 2);
      out.writeUInt32LE(values.length, 0);
      values.forEach((v, i) => out.writeUInt16LE(v, 4 + i * 2));
      return out;
    };
    const u = (n: number, bytes: number) => {
      const out = Buffer.alloc(bytes);
      if (bytes === 2) out.writeUInt16LE(n, 0);
      else out.writeUInt32LE(n, 0);
      return out;
    };
    this.queue(
      2,
      OP.GetDeviceInfo,
      transaction,
      Buffer.concat([u(100, 2), u(6, 4), u(100, 2), encodeString("microsoft.com: 1.0"), u(0, 2), list(operations), list([]), list([]), list([]), list([FORMAT_UNDEFINED, FORMAT_FOLDER]), encodeString("Amazon"), encodeString("Kindle"), encodeString("1.0"), encodeString("G000DEMO")]),
    );
    this.respond(RC.OK, transaction);
  }

  private storageInfo(transaction: number, storage: number) {
    if (this.storageUnavailable > 0) {
      this.storageUnavailable--;
      return this.respond(RC.StoreNotAvailable, transaction);
    }
    if (storage !== STORAGE) return this.respond(RC.InvalidStorageID, transaction);
    const capacity = this.quirks.capacity ?? 6_200_000_000;
    const head = Buffer.alloc(26);
    head.writeUInt16LE(3, 0);
    head.writeUInt16LE(2, 2);
    head.writeBigUInt64LE(BigInt(capacity), 6);
    head.writeBigUInt64LE(BigInt(Math.max(0, capacity - this.used())), 14);
    this.queue(2, OP.GetStorageInfo, transaction, Buffer.concat([head, encodeString("Internal Storage"), encodeString("")]));
    this.respond(RC.OK, transaction);
  }

  private objectHandles(transaction: number, params: number[]) {
    const [storage, , parent] = params;
    if (storage !== STORAGE) return this.respond(RC.InvalidStorageID, transaction);
    const dir = parent === ROOT ? this.root : this.paths.get(parent);
    if (!dir || !existsSync(dir)) return this.respond(RC.InvalidParentObject, transaction);
    const handles = readdirSync(dir).map((name) => this.idOf(join(dir, name)));
    const body = Buffer.alloc(4 + handles.length * 4);
    body.writeUInt32LE(handles.length, 0);
    handles.forEach((h, i) => body.writeUInt32LE(h, 4 + i * 4));
    this.queue(2, OP.GetObjectHandles, transaction, body);
    this.respond(RC.OK, transaction);
  }

  private objectInfo(transaction: number, handle: number) {
    const path = this.paths.get(handle);
    if (!path || !existsSync(path)) return this.respond(RC.InvalidObjectHandle, transaction);
    const stats = statSync(path);
    const head = Buffer.alloc(52);
    head.writeUInt32LE(STORAGE, 0);
    head.writeUInt16LE(stats.isDirectory() ? FORMAT_FOLDER : FORMAT_UNDEFINED, 4);
    head.writeUInt32LE(stats.isDirectory() ? 0 : (this.quirks.claimsSize ?? stats.size), 8);
    const parent = dirname(path);
    head.writeUInt32LE(parent === this.root ? 0 : this.idOf(parent), 38);
    this.queue(2, OP.GetObjectInfo, transaction, Buffer.concat([head, encodeString(path.slice(parent.length + 1)), Buffer.from([0, 0, 0])]));
    this.respond(RC.OK, transaction);
  }

  async read(max: number): Promise<Uint8Array> {
    const first = this.transfers[0];
    if (!first) throw new Error(`${OUT_OF_ORDER}a read with nothing to answer`);
    if (first.length > max) {
      this.transfers[0] = first.subarray(max);
      return first.subarray(0, max);
    }
    this.transfers.shift();
    if (first.length && first.length % this.packetSize === 0) {
      // Exactly full packets: an empty one ends the transfer, or the next answer runs straight on.
      if (this.quirks.noEmptyPackets && this.transfers.length) {
        const next = this.transfers.shift()!;
        return Buffer.concat([first, next]);
      }
      if (!this.quirks.noEmptyPackets) this.transfers.unshift(Buffer.alloc(0));
    }
    return first;
  }
}
