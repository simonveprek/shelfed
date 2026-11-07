import { describe, expect, it } from "vitest";
import { encodeObjectInfo, encodeString, FORMAT_FOLDER, FORMAT_UNDEFINED, MtpError, parseDeviceInfo, parseObjectInfo, parseStorageInfo, Reader, ROOT, Session, type Pipe } from "../src/main/mtp/protocol";

/*
 * The protocol checked against bytes written out by hand from its description,
 * not against code. The pretend Kindle shares this code's helpers, so it would
 * agree with a mistake in them. These wouldn't.
 */

const hex = (text: string) => Buffer.from(text.replace(/[^0-9a-f]/gi, ""), "hex");

/** A device that answers with exactly these reads, and remembers every write. */
function scripted(reads: Array<Buffer | string>, packetSize = 512) {
  const writes: Buffer[] = [];
  const queue = reads.map((r) => (typeof r === "string" ? hex(r) : r));
  const pipe: Pipe = {
    packetSize,
    async write(data) {
      writes.push(Buffer.from(data));
    },
    async read() {
      const next = queue.shift();
      if (!next) throw new Error("Read more than the device had to say");
      return next;
    },
  };
  return { pipe, writes };
}

/** A response container: length, type 3, code, transaction, parameters. */
const OK = (transaction: number) => `0c000000 0300 0120 ${transaction.toString(16).padStart(2, "0")}000000`;

/** A session already open, as everything but describing the device and opening runs in one; the writes start after it. */
async function inSession(reads: Array<Buffer | string>, packetSize = 512) {
  const { pipe, writes } = scripted([OK(0), ...reads], packetSize);
  const session = new Session(pipe);
  await session.open();
  writes.length = 0;
  return { session, writes };
}

describe("what goes down the cable", () => {
  it("opens a session as transaction 0, with session id 1", async () => {
    const { pipe, writes } = scripted([OK(0)]);
    await new Session(pipe).open();
    expect(writes).toEqual([hex("10000000 0100 0210 00000000 01000000")]);
  });

  // What a Kindle Paperwhite (12th generation) answered, on a Mac on 2026-11-07: asked to describe itself
  // as transaction 0 it did, and as transaction 1 it said the parameter wasn't supported.
  it("asks the device to describe itself as transaction 0, before any session, and again after one closes", async () => {
    // Version 1.00, Microsoft's extension, no lists, and four empty strings.
    const body = hex("6400 06000000 6400 00 0000 00000000 00000000 00000000 00000000 00000000 00 00 00 00");
    const head = hex("00000000 0200 0110 00000000");
    head.writeUInt32LE(12 + body.length, 0);
    const info = Buffer.concat([head, body]);
    const { pipe, writes } = scripted([info, OK(0), OK(0), OK(1), info, OK(0)]);
    const session = new Session(pipe);
    await session.deviceInfo();
    await session.open();
    await session.close();
    await session.deviceInfo();
    expect(writes.map((w) => [w.readUInt16LE(6), w.readUInt32LE(8)])).toEqual([
      [0x1001, 0],
      [0x1002, 0],
      [0x1003, 1],
      [0x1001, 0],
    ]);
  });

  it("asks for what's in the top of a storage with every format and the root parent", async () => {
    const { session, writes } = await inSession(["10000000 0200 0710 01000000 00000000", OK(1)]);
    await session.handles(0x00010001, ROOT);
    expect(writes[0]).toEqual(hex("18000000 0100 0710 01000000 01000100 00000000 ffffffff"));
  });

  it("deletes with the handle and no format", async () => {
    const { session, writes } = await inSession([OK(1)]);
    await session.remove(0x2a);
    expect(writes[0]).toEqual(hex("14000000 0100 0b10 01000000 2a000000 00000000"));
  });

  it("asks for part of a file by handle, offset and length", async () => {
    const { session, writes } = await inSession(["0f000000 0200 1b10 01000000 aabbcc", OK(1)]);
    const part = await session.getPartial(5, 100, 3);
    expect(writes[0]).toEqual(hex("18000000 0100 1b10 01000000 05000000 64000000 03000000"));
    expect(part).toEqual(hex("aabbcc"));
  });

  it("numbers transactions one after another", async () => {
    const { session, writes } = await inSession([OK(1), OK(2)]);
    await session.remove(1);
    await session.remove(2);
    expect(writes.map((w) => w.readUInt32LE(8))).toEqual([1, 2]);
  });

  it("announces a file with the fields where the description puts them", () => {
    const bytes = encodeObjectInfo({ storage: 0x00010001, parent: 7, format: FORMAT_UNDEFINED, size: 0x1234, name: "a" });
    expect(bytes).toEqual(
      hex(`
        01000100 0030 0000 34120000  /* storage, format, protection, size */
        0000 00000000 00000000 00000000  /* thumbnail format, size, width, height */
        00000000 00000000 00000000  /* image width, height, depth */
        07000000 0000 00000000 00000000  /* parent, association type and description, sequence */
        02 6100 0000  /* name: two units with the ending, then the "a" */
        00 00 00  /* no dates, no keywords */
      `.replace(/\/\*.*?\*\//g, "")),
    );
  });

  it("marks a new folder as a generic folder", () => {
    const bytes = encodeObjectInfo({ storage: 1, parent: ROOT, format: FORMAT_FOLDER, size: 0, name: "d" });
    expect(bytes.readUInt16LE(4)).toBe(0x3001);
    expect(bytes.readUInt32LE(38)).toBe(0xffffffff);
    expect(bytes.readUInt16LE(42)).toBe(1);
  });

  it("says a size too big for its field is too big, rather than wrapping round", () => {
    const bytes = encodeObjectInfo({ storage: 1, parent: 1, format: FORMAT_UNDEFINED, size: 5_000_000_000, name: "x" });
    expect(bytes.readUInt32LE(8)).toBe(0xffffffff);
  });

  it("writes a string as a count of units with the ending, then UTF-16", () => {
    expect(encodeString("Ží")).toEqual(hex("03 7d01 ed00 0000"));
  });

  it("puts a data header in the same write as the data, so it isn't a short packet", async () => {
    const { session, writes } = await inSession([OK(1)], 64);
    await session.send(100, [Buffer.alloc(100, 1)]);
    // The command, then a whole number of packets, then the rest.
    expect(writes.map((w) => w.length)).toEqual([12, 64, 48]);
    expect(writes[1].subarray(0, 12)).toEqual(hex("70000000 0200 0d10 01000000"));
    expect(writes[1][12]).toBe(1);
  });

  it("ends data that exactly fills its packets with an empty write", async () => {
    const { pipe, writes } = scripted([OK(1)], 64);
    await new Session(pipe).send(52, [Buffer.alloc(52, 1)]);
    expect(writes.map((w) => w.length)).toEqual([12, 64, 0]);
  });

  it("never writes a short chunk in the middle, however the file comes in", async () => {
    const { pipe, writes } = scripted([OK(1)], 64);
    await new Session(pipe).send(200, [Buffer.alloc(7), Buffer.alloc(93), Buffer.alloc(1), Buffer.alloc(99)]);
    const data = writes.slice(1);
    for (const write of data.slice(0, -1)) expect(write.length % 64).toBe(0);
    expect(data.reduce((sum, w) => sum + w.length, 0)).toBe(212);
  });
});

describe("what comes back up the cable", () => {
  it("reads a storage's room and names", () => {
    const info = parseStorageInfo(
      hex(`
        0300 0200 0000
        00e40b5402000000
        00c2eb0b00000000
        ffffffff
        03 4100 4200 0000
        00
      `),
    );
    expect(info).toEqual({ capacity: 10_000_000_000, free: 200_000_000, description: "AB", volume: "" });
  });

  it("reads a file's details from where the description puts them", () => {
    const info = parseObjectInfo(
      hex(`
        01000100 0030 0000 39300000
        0000 00000000 00000000 00000000
        00000000 00000000 00000000
        09000000 0000 00000000 00000000
        03 6200 6300 0000
        00 00 00
      `),
    );
    expect(info).toEqual({ storage: 0x00010001, format: 0x3000, size: 12345, parent: 9, name: "bc" });
  });

  it("reads who a device is, past the lists in front of it", () => {
    const info = parseDeviceInfo(
      hex(`
        6400 06000000 6400
        02 7800 0000
        0000
        02000000 0110 0210
        01000000 0240
        00000000
        00000000
        00000000
        02 4100 0000
        02 4b00 0000
        02 3100 0000
        02 5300 0000
      `),
    );
    expect(info).toEqual({ manufacturer: "A", model: "K", version: "1", serial: "S", operations: [0x1001, 0x1002] });
  });

  it("gets a new file's handle from the response, in the third place", async () => {
    const { pipe } = scripted(["18000000 0300 0120 01000000 01000100 07000000 2a000000"]);
    expect(await new Session(pipe).sendInfo({ storage: 1, parent: 7, format: FORMAT_UNDEFINED, size: 1, name: "a" })).toBe(0x2a);
  });

  it("gets the handle even when the response's parameters come in a read of their own", async () => {
    const { pipe } = scripted(["18000000 0300 0120 01000000", "01000100 07000000", "2a000000"]);
    expect(await new Session(pipe).sendInfo({ storage: 1, parent: 7, format: FORMAT_UNDEFINED, size: 1, name: "a" })).toBe(0x2a);
  });

  it("puts together a header split across reads", async () => {
    const { pipe } = scripted(["0c00", "000003", "00012001000000"]);
    await expect(new Session(pipe).remove(1)).resolves.toBeUndefined();
  });

  it("skips the empty packet left over from the data before", async () => {
    const { pipe } = scripted(["0c000000 0300 0120 01000000", "", "0c000000 0300 0120 02000000"]);
    const session = new Session(pipe);
    await session.remove(1);
    await session.remove(2);
  });

  it("finds the response when a device runs it straight on after the data", async () => {
    const { pipe } = scripted(["0e000000 0200 0910 01000000 aabb 0c000000 0300 0120 01000000"]);
    const got: Buffer[] = [];
    await new Session(pipe).getObject(1, (chunk) => void got.push(Buffer.from(chunk)));
    expect(Buffer.concat(got)).toEqual(hex("aabb"));
  });

  it("keeps what came after the response for the next answer", async () => {
    const { pipe } = scripted(["0c000000 0300 0120 01000000 0c000000 0300 0120 02000000"]);
    const session = new Session(pipe);
    await session.remove(1);
    await session.remove(2);
  });

  it("reads data of a size too big to say until its transfer ends", async () => {
    const { pipe } = scripted([Buffer.concat([hex("ffffffff 0200 0910 01000000"), Buffer.alloc(500, 1)]), Buffer.alloc(512, 2), Buffer.alloc(10, 3), OK(1)]);
    let size = 0;
    await new Session(pipe).getObject(1, (chunk) => void (size += chunk.length));
    expect(size).toBe(1022);
  });

  it("skips an empty slot in the storages", async () => {
    const { pipe } = scripted(["18000000 0200 0410 01000000 02000000 00000200 01000100", OK(1)]);
    expect(await new Session(pipe).storageIds()).toEqual([0x00010001]);
  });

  it("gives a device's refusal with its code", async () => {
    const { pipe } = scripted(["0c000000 0300 0920 01000000"]);
    const error = await new Session(pipe).remove(1).catch((e) => e);
    expect(error).toBeInstanceOf(MtpError);
    expect((error as MtpError).code).toBe(0x2009);
  });

  it("takes a session someone left open as open", async () => {
    const { pipe } = scripted(["0c000000 0300 1e20 00000000"]);
    await expect(new Session(pipe).open()).resolves.toBeUndefined();
  });

  it("gives up rather than wait forever on a device that only sends empty packets", async () => {
    const { pipe } = scripted(["", "", "", "", "", ""]);
    await expect(new Session(pipe).remove(1)).rejects.toThrow("stopped answering");
  });

  it("says so when data stops short", async () => {
    const { pipe } = scripted(["20000000 0200 0910 01000000 aabb", ""]);
    await expect(new Session(pipe).getObject(1, () => {})).rejects.toThrow("part way");
  });

  it("says so when a response stops short", async () => {
    const { pipe } = scripted(["18000000 0300 0120 01000000", ""]);
    await expect(new Session(pipe).sendInfo({ storage: 1, parent: 7, format: FORMAT_UNDEFINED, size: 1, name: "a" })).rejects.toThrow("part way");
  });
});

describe("a device that lies", () => {
  it("can't run this computer out of memory by claiming a huge answer", async () => {
    // It says it's sending 4 GB of details, and keeps going.
    const flood = Buffer.alloc(1024 * 1024, 7);
    const reads = [Buffer.concat([hex("feffffff 0200 0410 01000000"), flood]), ...Array.from({ length: 40 }, () => flood)];
    const { pipe } = scripted(reads);
    await expect(new Session(pipe).storageIds()).rejects.toThrow("more than it should");
  });

  it("can't keep it busy with answers that never end", async () => {
    const data = "0e000000 0200 0410 01000000 aabb";
    const { pipe } = scripted(Array.from({ length: 50 }, () => data));
    await expect(new Session(pipe).remove(1)).rejects.toThrow("won't stop");
  });

  it("can't send data nobody asked for and have it kept", async () => {
    const flood = Buffer.alloc(1024 * 1024, 7);
    const { pipe } = scripted([Buffer.concat([hex("feffffff 0200 0b10 01000000"), flood]), ...Array.from({ length: 40 }, () => flood)]);
    await expect(new Session(pipe).remove(1)).rejects.toThrow("more than it should");
  });

  it("can't give more of a file than was asked for", async () => {
    const { pipe } = scripted(["14000000 0200 1b10 01000000 aabbccddeeff0011", OK(1)]);
    await expect(new Session(pipe).getPartial(1, 0, 3)).rejects.toThrow("more than it should");
  });

  it("can't claim a response of any size", async () => {
    const { pipe } = scripted(["ffffff7f 0300 0120 01000000"]);
    await expect(new Session(pipe).remove(1)).rejects.toThrow("broken answer");
  });

  it("can't claim a container smaller than its own header", async () => {
    const { pipe } = scripted(["04000000 0300 0120 01000000"]);
    await expect(new Session(pipe).remove(1)).rejects.toThrow("broken answer");
  });

  it("can't overrun a reader with counts that aren't there", () => {
    // Says it has a billion storages, and has none.
    expect(new Reader(hex("00ca9a3b")).u32s()).toEqual([]);
    expect(parseDeviceInfo(hex("6400 06000000 6400 00 0000 ffffffff")).operations).toEqual([]);
    expect(parseObjectInfo(hex("0100")).name).toBe("");
  });

  it("can't overrun a string with a count that isn't there", () => {
    expect(new Reader(hex("ff 4100")).string()).toBe("A");
  });
});

describe("very large files", () => {
  const MB = 1024 * 1024;

  it("sends one a piece at a time, never holding much of it in memory", async () => {
    let biggest = 0;
    let total = 0;
    const pipe: Pipe = {
      packetSize: 512,
      async write(data) {
        biggest = Math.max(biggest, data.length);
        total += data.length;
        // The 12 byte command is a transfer of its own. After that only the very last write may be short.
        if (total > 12 && data.length % 512 && total < 12 + 12 + 800 * MB) throw new Error("A short write in the middle");
      },
      async read() {
        return hex("0c000000 0300 0120 01000000");
      },
    };
    const piece = Buffer.alloc(256 * 1024, 1);
    function* chunks() {
      for (let i = 0; i < (800 * MB) / piece.length; i++) yield piece;
    }
    await new Session(pipe).send(800 * MB, chunks());
    expect(total).toBe(12 + 12 + 800 * MB);
    expect(biggest).toBeLessThanOrEqual(piece.length + 512);
  }, 60_000);

  it("receives one a piece at a time, passing each straight on", async () => {
    const size = 800 * MB;
    const piece = Buffer.alloc(256 * 1024, 1);
    let sent = 0;
    let answered = false;
    const pipe: Pipe = {
      packetSize: 512,
      async write() {},
      async read() {
        if (sent === 0) {
          sent = piece.length - 12;
          const head = Buffer.from(piece);
          head.writeUInt32LE(size + 12, 0);
          head.writeUInt16LE(2, 4);
          head.writeUInt16LE(0x1009, 6);
          head.writeUInt32LE(1, 8);
          return head;
        }
        if (sent < size) {
          const take = Math.min(piece.length, size - sent);
          sent += take;
          return piece.subarray(0, take);
        }
        answered = true;
        return hex("0c000000 0300 0120 01000000");
      },
    };
    let got = 0;
    let biggest = 0;
    await new Session(pipe).getObject(1, (chunk) => {
      got += chunk.length;
      biggest = Math.max(biggest, chunk.length);
    });
    expect(got).toBe(size);
    expect(biggest).toBeLessThanOrEqual(piece.length);
    expect(answered).toBe(true);
  }, 60_000);
});
