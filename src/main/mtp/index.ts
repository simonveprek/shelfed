import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import log from "electron-log/main";
import { baseName, isSafeBookPath } from "../kindle-files";
import { safeName } from "../library";
import { connectsLikeAPhone, kindleById } from "../../shared/kindles";
import { t } from "../../shared/i18n";
import type { KindleDevice, KindleFile, KindleLink, KindleOnUsb } from "../../shared/types";
import { Incomplete, KindleBusy, MtpKindle, NoMtp, NoRoom, TooBig, type Backend } from "./kindle";

/*
 * Kindles from 2024 on, from plugging in to pulling out. Each gets a queue, so
 * only one thing talks to it at a time, and a connection that's let go of after
 * a few seconds of quiet, so Shelfed never keeps a Kindle from other programs
 * when it isn't using it.
 */

const PREFIX = "mtp:";
/** How long a connection stays open with nothing to do. */
const LINGER = 5000;
/** How long what's on a Kindle is taken as known, unless Shelfed changed it itself. */
const LIST_FOR = 45_000;
/** How long a Kindle that might open as a drive gets to do that first. */
const MOUNTING = 10_000;
/** How soon to try again, by what went wrong. */
const AGAIN: Partial<Record<KindleLink, number>> = { busy: 8000, failed: 20_000, none: 30_000 };
/** The longest a whole name can be on a Kindle, kept short of MTP's own limit. */
const LONGEST_NAME = 200;
/** The largest a highlights file could sensibly be. */
const LARGEST_CLIPPINGS = 64 * 1024 * 1024;

type Connect = (serial: string, afterFailure: boolean) => Promise<{ backend: Backend; about?: string }>;

type Kindle = {
  serial: string;
  model?: string;
  since: number;
  link: KindleLink;
  tried: number;
  probing: boolean;
  device?: KindleDevice;
  queue: Promise<unknown>;
  open?: MtpKindle;
  timer?: ReturnType<typeof setTimeout>;
  broken: boolean;
  files?: { at: number; list: KindleFile[] };
  /** What went wrong last and what the device says it is, for a report. */
  problem?: string;
  about?: string;
};

const kindles = new Map<string, Kindle>();

/** How to reach a Kindle on this system. */
let connector: Connect = async (serial, afterFailure) => {
  if (process.platform === "win32") return (await import("./wpd")).connectWpd(serial);
  return (await import("./usb")).connectUsb(serial, afterFailure);
};

/** For the pretend Kindle: reach it some other way. */
export function setConnector(connect: Connect) {
  connector = connect;
}

export const isMtpPath = (path: string) => path.startsWith(PREFIX);
const serialOf = (path: string) => path.slice(PREFIX.length);

function sized(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(n / 1e6))} MB`;
}

/** What went wrong, said so someone can do something about it. */
export function plainMtpError(error: unknown): Error {
  if (error instanceof NoRoom) return new Error(t("There isn't room on your Kindle for this. It needs {need}, and {free} is free.", { need: sized(error.need), free: sized(error.free) }));
  if (error instanceof KindleBusy) return new Error(t("Another app has your Kindle open. Quit it, then try again."));
  if (error instanceof TooBig) return new Error(t("That book is too big for Shelfed to copy off your Kindle."));
  if (error instanceof Incomplete) return new Error(t("That book didn't arrive whole on your Kindle, so Shelfed took it off again. Try once more."));
  return new Error(t("Your Kindle stopped answering. Unplug it, plug it in again, and try once more."));
}

async function shut(kindle: Kindle) {
  clearTimeout(kindle.timer);
  kindle.timer = undefined;
  const open = kindle.open;
  kindle.open = undefined;
  await open?.close().catch((error) => log.warn("Closing a Kindle", error));
}

/** Runs one job on a Kindle, after whatever is ahead of it, connecting if it has to. */
function withKindle<T>(kindle: Kindle, job: (open: MtpKindle) => Promise<T>): Promise<T> {
  const run = kindle.queue.then(async () => {
    clearTimeout(kindle.timer);
    try {
      if (!kindle.open) {
        const { backend, about } = await connector(kindle.serial, kindle.broken);
        kindle.open = new MtpKindle(backend);
        // What it says about itself comes from the device, so it's only ever plain, short text.
        if (about) kindle.about = reportable(about, 1000);
        kindle.broken = false;
      }
      return await job(kindle.open);
    } catch (error) {
      kindle.problem = reportable(error);
      // A file too big to fit changes nothing about the connection. Anything else might have.
      if (!(error instanceof NoRoom || error instanceof TooBig || error instanceof NoMtp || error instanceof KindleBusy)) {
        kindle.broken = true;
        await shut(kindle);
      }
      throw error;
    } finally {
      if (kindle.open) {
        kindle.timer = setTimeout(() => void (kindle.queue = kindle.queue.then(() => shut(kindle))), LINGER);
        kindle.timer.unref?.();
      }
    }
  });
  kindle.queue = run.catch(() => {});
  return run;
}

async function probe(kindle: Kindle) {
  if (kindle.probing) return;
  kindle.probing = true;
  kindle.tried = Date.now();
  try {
    const space = await withKindle(kindle, (open) => open.space());
    kindle.device = { name: kindleById(kindle.model)?.name ?? "Kindle", path: `${PREFIX}${kindle.serial}`, free: space.free, model: kindle.model };
    kindle.link = "ready";
    log.info("Kindle open over MTP", kindle.serial.slice(0, 6), space.name);
  } catch (error) {
    kindle.device = undefined;
    kindle.link = error instanceof KindleBusy ? "busy" : error instanceof NoMtp ? "none" : "failed";
    log.warn(`Kindle not open over MTP: ${kindle.link}`, (error as Error).message);
  } finally {
    kindle.probing = false;
  }
}

/**
 * Keeps up with the Kindles on the bus that aren't drives, and says how each is
 * doing. It never waits on a Kindle: opening one happens to the side, and the
 * next look finds out how it went.
 */
export function look(usb: KindleOnUsb[]) {
  const now = Date.now();
  for (const [serial, kindle] of kindles) {
    if (usb.some((k) => k.serial === serial)) continue;
    kindles.delete(serial);
    kindle.queue = kindle.queue.then(() => shut(kindle));
  }
  for (const { serial, model } of usb) {
    let kindle = kindles.get(serial);
    if (!kindle) kindles.set(serial, (kindle = { serial, model, since: now, link: "opening", tried: 0, probing: false, queue: Promise.resolve(), broken: false }));
    if (kindle.link === "ready") continue;
    const phone = connectsLikeAPhone(kindleById(model));
    const due = kindle.tried ? now - kindle.tried > (AGAIN[kindle.link] ?? MOUNTING) : phone || now - kindle.since > MOUNTING;
    if (due) void probe(kindle);
  }
  return {
    usb: usb.map((k): KindleOnUsb => ({ ...k, link: kindles.get(k.serial)?.link })),
    devices: [...kindles.values()].flatMap((k) => (k.device ? [k.device] : [])),
  };
}

/** The Kindles open over MTP right now. */
export const readyDevices = () => [...kindles.values()].flatMap((k) => (k.device ? [k.device] : []));

function kindleAt(path: string) {
  const kindle = kindles.get(serialOf(path));
  if (!kindle) throw new Error(t("Your Kindle isn't plugged in any more."));
  return kindle;
}

/** Runs a job, saying plainly what went wrong and noticing another program taking the Kindle. */
async function plainly<T>(kindle: Kindle, job: (open: MtpKindle) => Promise<T>): Promise<T> {
  try {
    return await withKindle(kindle, job);
  } catch (error) {
    log.warn("Kindle over MTP", error);
    if (error instanceof KindleBusy) {
      kindle.link = "busy";
      kindle.device = undefined;
      kindle.tried = Date.now();
    }
    throw plainMtpError(error);
  }
}

async function refreshSpace(kindle: Kindle, open: MtpKindle) {
  const space = await open.space().catch(() => null);
  if (space && kindle.device) kindle.device = { ...kindle.device, free: space.free };
}

export async function mtpFiles(path: string): Promise<KindleFile[]> {
  const kindle = kindleAt(path);
  if (kindle.files && Date.now() - kindle.files.at < LIST_FOR) return kindle.files.list;
  const list = await plainly(kindle, (open) => open.files());
  kindle.files = { at: Date.now(), list };
  return list;
}

/**
 * A name from a device as one this computer can safely use. Only the part
 * before the extension is made safe, so a book called CON.azw3 stays an AZW3.
 */
function localName(name: string) {
  const ext = name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? "";
  return `${safeName(name.slice(0, name.length - ext.length), LONGEST_NAME)}${ext}`;
}

/** A name a Kindle can hold, cut short in the middle of the title if it must be, never its extension. */
export function kindleName(name: string) {
  if (name.length <= LONGEST_NAME) return name;
  const ext = name.match(/\.[^.]+$/)?.[0] ?? "";
  // Not through the middle of a character written as two units, like an emoji.
  const kept = name.slice(0, LONGEST_NAME - ext.length).replace(/[\ud800-\udbff]$/, "");
  return `${kept.trimEnd()}${ext}`;
}

export async function mtpCopy(path: string, file: string, name: string, size: number, progress?: (fraction: number) => void) {
  const kindle = kindleAt(path);
  const copied = await plainly(kindle, async (open) => {
    const done = await open.put(file, kindleName(name), size, (bytes) => progress?.(size ? bytes / size : 1));
    await refreshSpace(kindle, open);
    return done;
  });
  kindle.files = undefined;
  return copied;
}

export async function mtpRemove(path: string, files: string[]) {
  const kindle = kindleAt(path);
  const freed = await plainly(kindle, async (open) => {
    const bytes = await open.remove(files);
    await refreshSpace(kindle, open);
    return bytes;
  });
  kindle.files = undefined;
  return freed;
}

/** Copies files off a Kindle to temporary folders the downloads clean-up knows about. Gives back where each went. */
export async function mtpFetch(path: string, files: string[], progress?: (fraction: number) => void) {
  const kindle = kindleAt(path);
  if (!files.every(isSafeBookPath)) throw new Error(t("That file isn't on your Kindle."));
  return plainly(kindle, async (open) => {
    const out: string[] = [];
    const dirs: string[] = [];
    try {
      for (const [i, file] of files.entries()) {
        const dir = await mkdtemp(join(tmpdir(), "shelf-"));
        dirs.push(dir);
        const target = join(dir, localName(baseName(file)));
        await open.get(file, target);
        out.push(target);
        progress?.((i + 1) / files.length);
      }
      return out;
    } catch (error) {
      // All or nothing: nobody will come back for the ones that made it.
      await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
      throw error;
    }
  });
}

/** The clippings file from each Kindle open over MTP. */
export async function mtpClippings() {
  const out: Array<{ device: string; text: string }> = [];
  for (const device of readyDevices()) {
    const kindle = kindles.get(serialOf(device.path));
    if (!kindle) continue;
    const text = await plainly(kindle, async (open) => {
      if (!(await open.has("My Clippings.txt"))) return null;
      const dir = await mkdtemp(join(tmpdir(), "shelf-"));
      try {
        const target = join(dir, "My Clippings.txt");
        await open.get("My Clippings.txt", target, LARGEST_CLIPPINGS);
        return await readFile(target, "utf8");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }).catch(() => null);
    if (text !== null) out.push({ device: device.name, text });
  }
  return out;
}

/** Lets go of every Kindle, as Shelfed quits. */
export async function closeAll() {
  await Promise.all([...kindles.values()].map((kindle) => (kindle.queue = kindle.queue.then(() => shut(kindle)))));
}

/**
 * What's known about each Kindle, for someone to send when one won't work. It
 * says what the device is and how it answered, and never what's on it: no file
 * names, and only the start of the serial, which is the model.
 */
export function kindleReport() {
  if (!kindles.size) return "No Kindle has been seen on USB since it was last plugged in.";
  return [...kindles.values()]
    .map((kindle) =>
      [
        `Kindle ${kindle.serial.slice(0, 6)}, model ${kindle.model ?? "not known"}`,
        `Connection: ${kindle.link}`,
        ...(kindle.problem ? [`Last problem: ${kindle.problem}`] : []),
        ...(kindle.device ? [`Free: ${kindle.device.free}`] : []),
        ...(kindle.about ? [`Device: ${kindle.about}`] : []),
      ].join("\n"),
    )
    .join("\n\n");
}

/** An error as it can go in a report: plain characters, short, without the name of whoever's computer this is. */
export function reportable(error: unknown, longest = 300) {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  const message = error instanceof Error ? error.message : String(error);
  return (home ? message.split(home).join("~") : message).replace(/[^\x20-\x7e]/g, "?").slice(0, longest);
}
