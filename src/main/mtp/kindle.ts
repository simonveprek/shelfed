import { open, rm, stat } from "node:fs/promises";
import { isBookFile, isSafeName, baseName, lockedBy } from "../kindle-files";
import type { KindleFile } from "../../shared/types";

/*
 * A Kindle reached over MTP, in the terms the rest of Shelfed uses: a documents
 * folder with book files in it. Below this is a backend, which on a Mac is
 * Shelfed's own MTP code over USB and on Windows is the system's portable
 * devices service, since Windows keeps these devices to itself.
 */

export type Entry = { id: string; name: string; size: number; folder: boolean };
export type Storage = { id: string; name: string; capacity: number; free: number };

export interface Backend {
  storages(): Promise<Storage[]>;
  /** What's directly inside a folder, or at the top of the storage when parent is null. */
  children(storage: string, parent: string | null): Promise<Entry[]>;
  makeFolder(storage: string, parent: string | null, name: string): Promise<string>;
  send(storage: string, parent: string, name: string, file: string, size: number, progress?: (done: number) => void): Promise<string>;
  /** Copies a file here, stopping if the device sends more than size bytes. */
  fetch(id: string, file: string, size: number, progress?: (done: number) => void): Promise<void>;
  /** Bytes from inside a file, or null when this device can't do that. */
  read(id: string, offset: number, length: number): Promise<Buffer | null>;
  remove(id: string): Promise<void>;
  close(): Promise<void>;
}

/** The most things a folder may hold, and a whole Kindle, as far as Shelfed will look. */
export const MOST_CHILDREN = 20_000;
const MOST_OBJECTS = 50_000;
/** How much of each end of a file to compare, to tell if it's already on the Kindle. */
const COMPARE = 4096;
/** The most files whose locks are remembered, since names come from the device. */
const MOST_REMEMBERED = 5000;
/** The largest book Shelfed will copy off a Kindle. Sizes come from the device, so this has to be said somewhere. */
const LARGEST_BOOK = 2 * 1024 * 1024 * 1024;

/** A file bigger than Shelfed will copy off. */
export class TooBig extends Error {}

/** Not enough room for a book, in numbers, so it can be said plainly. */
export class NoRoom extends Error {
  constructor(
    readonly need: number,
    readonly free: number,
  ) {
    super("Not enough room on the Kindle");
  }
}

/** A file that came out a different size from what went in. */
export class Incomplete extends Error {}

/** Another program has the Kindle open. On macOS and Linux only one can have it at a time. */
export class KindleBusy extends Error {}

/** This Kindle has no MTP on it: it's one that opens as a drive. */
export class NoMtp extends Error {}

const DOCUMENTS = /^documents$/i;
/** The same name, give or take capitals. Nothing looser: a name that only looks alike is another file. */
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** What was found locked, by name and size, so a file is only looked inside once. */
const lockedCache = new Map<string, boolean>();

export class MtpKindle {
  private storageId: string | null = null;
  private documentsId: string | null = null;

  constructor(private backend: Backend) {}

  /** What's in a folder, without anything named to deceive. */
  private async entries(storage: string, parent: string | null) {
    return (await this.backend.children(storage, parent)).filter((entry) => isSafeName(entry.name));
  }

  /** The Kindle's own storage: the first one that has any room to it. */
  async space(): Promise<Storage> {
    const storages = await this.backend.storages();
    const main = storages.find((s) => s.id === this.storageId) ?? storages.find((s) => s.capacity > 0) ?? storages[0];
    if (!main) throw new Error("The Kindle has no storage to open");
    this.storageId = main.id;
    return main;
  }

  /** The documents folder, made if a brand new Kindle has none yet. */
  private async documents(make: boolean) {
    const storage = this.storageId ?? (await this.space()).id;
    if (this.documentsId) return { storage, folder: this.documentsId };
    const top = await this.entries(storage, null);
    let folder = top.find((e) => e.folder && DOCUMENTS.test(e.name))?.id ?? null;
    if (!folder && make) folder = await this.backend.makeFolder(storage, null, "documents");
    this.documentsId = folder;
    return { storage, folder };
  }

  /**
   * The book files in the documents folder, a few folders deep, with their
   * sizes and whether they're locked. Kindles keep each book's notes in a
   * .sdr folder beside it; those are skipped.
   */
  async files(): Promise<KindleFile[]> {
    const { storage, folder } = await this.documents(false);
    if (!folder) return [];
    const found: KindleFile[] = [];
    let seen = 0;
    const walk = async (parent: string, prefix: string, depth: number) => {
      for (const entry of await this.entries(storage, parent)) {
        if (++seen > MOST_OBJECTS) return;
        if (entry.folder) {
          if (depth < 3 && !entry.name.endsWith(".sdr") && !entry.name.startsWith(".")) await walk(entry.id, `${prefix}${entry.name}/`, depth + 1);
          // An empty file is what a copy leaves when the cable comes out partway: not a book yet.
        } else if (entry.size > 0 && isBookFile(entry.name)) {
          const key = `${prefix}${entry.name}\0${entry.size}`;
          let locked = lockedCache.get(key);
          if (locked === undefined) {
            locked = await lockedBy(entry.name, (offset, length) => this.backend.read(entry.id, offset, length));
            if (lockedCache.size >= MOST_REMEMBERED) lockedCache.clear();
            lockedCache.set(key, locked);
          }
          found.push({ name: entry.name, path: `${prefix}${entry.name}`, size: entry.size, ...(locked ? { locked } : {}) });
        }
      }
    };
    await walk(folder, "", 0);
    return found;
  }

  /** Finds a path inside the documents folder, one name at a time, so nothing outside it can be reached. */
  private async find(path: string) {
    const { storage, folder } = await this.documents(false);
    if (!folder) return null;
    const names = path.split("/");
    let parent = folder;
    for (let i = 0; i < names.length; i++) {
      const entries = await this.entries(storage, parent);
      // The exact name first: only a Kindle with no such file gets one differing in capitals.
      const entry = entries.find((e) => e.name === names[i]) ?? entries.find((e) => same(e.name, names[i]));
      if (!entry) return null;
      if (i === names.length - 1) return { entry, siblings: entries };
      if (!entry.folder) return null;
      parent = entry.id;
    }
    return null;
  }

  /**
   * Copies a book into the documents folder, over one of the same name. It
   * only counts once the Kindle reports the file at its whole size.
   */
  async put(file: string, name: string, size: number, progress?: (done: number) => void) {
    if (!isSafeName(name)) throw new Error("That isn't a name a Kindle can hold");
    const room = await this.space();
    const { storage, folder } = await this.documents(true);
    const existing = (await this.entries(storage, folder!)).find((e) => !e.folder && same(e.name, name));
    if (size > room.free + (existing?.size ?? 0)) throw new NoRoom(size, room.free + (existing?.size ?? 0));
    // MTP has no way to replace a file in one step, so the old one has to go first. Not for nothing, though.
    if (existing && existing.size === size && (await this.alreadyThere(existing.id, file, size))) {
      progress?.(size);
      return size;
    }
    if (existing) await this.backend.remove(existing.id);
    const id = await this.backend.send(storage, folder!, name, file, size, progress);
    const arrived = (await this.entries(storage, folder!)).find((e) => e.id === id || same(e.name, name));
    if (!arrived || arrived.size !== size) {
      if (arrived) await this.backend.remove(arrived.id).catch(() => {});
      throw new Incomplete(`A book arrived as ${arrived?.size ?? 0} of ${size} bytes`);
    }
    return size;
  }

  /** Whether a file of the same size is this one, going by its first and last bytes. No means send it. */
  private async alreadyThere(id: string, file: string, size: number) {
    const part = Math.min(COMPARE, size);
    const local = await open(file, "r");
    try {
      for (const offset of size > part ? [0, size - part] : [0]) {
        const theirs = await this.backend.read(id, offset, part);
        const mine = Buffer.alloc(part);
        await local.read(mine, 0, part, offset);
        if (!theirs || !theirs.equals(mine)) return false;
      }
      return true;
    } finally {
      await local.close();
    }
  }

  /**
   * Copies a file from inside the documents folder to this computer. All of it
   * or none of it: whatever goes wrong, no part of it stays behind.
   */
  async get(path: string, file: string, largest = LARGEST_BOOK, progress?: (done: number) => void) {
    const found = await this.find(path);
    if (!found || found.entry.folder) throw new Error("That file isn't on the Kindle");
    if (found.entry.size > largest) throw new TooBig();
    try {
      await this.backend.fetch(found.entry.id, file, found.entry.size, progress);
      if ((await stat(file)).size !== found.entry.size) throw new Incomplete("A file came off the wrong size");
    } catch (error) {
      await rm(file, { force: true }).catch(() => {});
      throw error;
    }
    return found.entry.size;
  }

  /**
   * Takes book files off, each with the notes folder the Kindle keeps beside
   * it. Only book files inside documents go; anything else asked for is left.
   * Returns how many bytes were freed.
   */
  async remove(paths: string[]) {
    let freed = 0;
    for (const path of paths) {
      if (!isBookFile(baseName(path))) continue;
      const found = await this.find(path);
      if (!found || found.entry.folder) continue;
      await this.backend.remove(found.entry.id);
      freed += found.entry.size;
      const notes = baseName(path).replace(/\.[^.]+$/, ".sdr");
      const sdr = found.siblings.find((e) => e.folder && same(e.name, notes));
      if (sdr) await this.backend.remove(sdr.id).catch(() => {});
    }
    return freed;
  }

  async has(path: string) {
    return Boolean(await this.find(path));
  }

  close() {
    return this.backend.close();
  }
}
