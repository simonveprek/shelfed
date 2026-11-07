import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { FORMAT_FOLDER, FORMAT_UNDEFINED, MtpError, OP, RC, ROOT, Session, type Pipe } from "./protocol";
import { MOST_CHILDREN, type Backend, type Entry, type Storage } from "./kindle";

/** How long a Kindle gets to find its storage after being plugged in, in tries a second or so apart. */
const STORAGE_TRIES = 8;

/** Shelfed's own MTP, over whatever pipe reaches the device. */
export class SessionBackend implements Backend {
  private session: Session;
  private partial = false;

  private constructor(
    pipe: Pipe,
    private finish: () => Promise<void>,
  ) {
    this.session = new Session(pipe);
  }

  /** Starts a session on a pipe. finish lets go of the device; it runs however closing goes. */
  static async start(pipe: Pipe, finish: () => Promise<void>) {
    const backend = new SessionBackend(pipe, finish);
    const info = await backend.session.deviceInfo();
    backend.partial = info.operations.includes(OP.GetPartialObject);
    await backend.session.open();
    return { backend, info };
  }

  async storages(): Promise<Storage[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        const ids = await this.session.storageIds();
        const out: Storage[] = [];
        for (const id of ids) {
          const info = await this.session.storageInfo(id);
          out.push({ id: String(id), name: info.description || info.volume, capacity: info.capacity, free: info.free });
        }
        // A Kindle just plugged in can take its time to offer any storage at all.
        if (out.length || attempt >= STORAGE_TRIES) return out;
      } catch (error) {
        const code = (error as MtpError).code;
        if (attempt >= STORAGE_TRIES || (code !== RC.StoreNotAvailable && code !== RC.InvalidStorageID)) throw error;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  async children(storage: string, parent: string | null): Promise<Entry[]> {
    const handles = (await this.session.handles(Number(storage), parent === null ? ROOT : Number(parent))).slice(0, MOST_CHILDREN);
    const out: Entry[] = [];
    for (const handle of handles) {
      const info = await this.session.objectInfo(handle);
      out.push({ id: String(handle), name: info.name, size: info.size, folder: info.format === FORMAT_FOLDER });
    }
    return out;
  }

  async makeFolder(storage: string, parent: string | null, name: string) {
    const id = await this.session.sendInfo({ storage: Number(storage), parent: parent === null ? ROOT : Number(parent), format: FORMAT_FOLDER, size: 0, name });
    return String(id);
  }

  async send(storage: string, parent: string, name: string, file: string, size: number, progress?: (done: number) => void) {
    const handle = await this.session.sendInfo({ storage: Number(storage), parent: Number(parent), format: FORMAT_UNDEFINED, size, name });
    const session = this.session;
    let done = 0;
    async function* chunks() {
      for await (const chunk of createReadStream(file, { highWaterMark: 256 * 1024 })) {
        done += (chunk as Buffer).length;
        yield chunk as Buffer;
        progress?.(done);
      }
    }
    try {
      await session.send(size, chunks());
    } catch (error) {
      // Half a book on a Kindle is worse than none. Only asked if the device is still answering.
      if (error instanceof MtpError) await session.remove(handle).catch(() => {});
      throw error;
    }
    return String(handle);
  }

  async fetch(id: string, file: string, size: number, progress?: (done: number) => void) {
    const out = await open(file, "w");
    let done = 0;
    try {
      await this.session.getObject(Number(id), async (chunk) => {
        // No more than it said the file was, however much it goes on sending.
        if (done + chunk.length > size) throw new Error("The device sent more of a file than it said there was");
        await out.write(chunk);
        done += chunk.length;
        progress?.(done);
      });
    } finally {
      await out.close();
    }
  }

  async read(id: string, offset: number, length: number) {
    if (!this.partial) return null;
    return this.session.getPartial(Number(id), offset, length);
  }

  remove(id: string) {
    return this.session.remove(Number(id));
  }

  async close() {
    await this.session.close().catch(() => {});
    await this.finish();
  }
}
