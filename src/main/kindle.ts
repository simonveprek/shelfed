import { access, copyFile, lstat, mkdir, open, readdir, readFile, rm, stat, statfs } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import nodemailer from "nodemailer";
import { kindleFromSerial } from "../shared/kindles";
import { isReaderBook, READERS, type ReaderKind } from "../shared/ereaders";
import type { KindleDevice, KindleFile, KindleOnUsb, KindleSettings } from "../shared/types";
import { getSmtpPassword } from "./settings";
import { isBookFile, lockedBy } from "./kindle-files";
import { isMtpPath, look, mtpClippings, mtpCopy, mtpFetch, mtpFiles, mtpRemove, readyDevices } from "./mtp";
import { t } from "../shared/i18n";

/** Common mail services, so most people only type their address. */
export const SMTP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  "gmail.com": { host: "smtp.gmail.com", port: 465, secure: true },
  "googlemail.com": { host: "smtp.gmail.com", port: 465, secure: true },
  "outlook.com": { host: "smtp.office365.com", port: 587, secure: false },
  "hotmail.com": { host: "smtp.office365.com", port: 587, secure: false },
  "live.com": { host: "smtp.office365.com", port: 587, secure: false },
  "icloud.com": { host: "smtp.mail.me.com", port: 587, secure: false },
  "me.com": { host: "smtp.mail.me.com", port: 587, secure: false },
  "yahoo.com": { host: "smtp.mail.yahoo.com", port: 465, secure: true },
  "fastmail.com": { host: "smtp.fastmail.com", port: 465, secure: true },
  "seznam.cz": { host: "smtp.seznam.cz", port: 465, secure: true },
};

function transport(settings: KindleSettings) {
  const password = getSmtpPassword();
  if (!settings.host || !settings.from) throw new Error(t("Set up sending in Settings first."));
  if (!password) throw new Error(t("Add your mail password in Settings."));
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user || settings.from, pass: password },
    connectionTimeout: 20_000,
  });
}

/**
 * A mail service turning the password away, said as what to do about it. The
 * password someone signs in with is the usual mistake, and the big services
 * only take an app password made for one program.
 */
export function plainMailError(error: unknown): unknown {
  const code = (error as { code?: string; responseCode?: number } | null)?.code;
  const response = (error as { responseCode?: number } | null)?.responseCode;
  if (code !== "EAUTH" && response !== 535 && response !== 534) return error;
  return new Error(t("Your mail didn't take that password. It wants an app password, not the one you sign in with. Settings, Sending, says where to make one."));
}

export async function verifyMail(settings: KindleSettings) {
  await transport(settings).verify().catch((error) => Promise.reject(plainMailError(error)));
  return true;
}

export async function sendToKindle(settings: KindleSettings, file: string, name: string, title: string) {
  if (!settings.to.trim()) throw new Error(t("Add your Send to Kindle address in Settings."));
  await transport(settings).sendMail({
    from: settings.from,
    to: settings.to.trim(),
    subject: title,
    text: t("{title}, sent from Shelfed.", { title }),
    attachments: [{ filename: name, path: file }],
  }).catch((error) => Promise.reject(plainMailError(error)));
}

/** Whether a path exists, giving up rather than hanging on a drive that won't answer. */
function exists(path: string, ms = 1500): Promise<boolean> {
  return Promise.race([
    access(path).then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((r) => setTimeout(() => r(false), ms)),
  ]);
}

const run = promisify(execFile);
const AMAZON = 0x1949;

/** What the system says is plugged in: Kindle serials, and on Windows the removable drive letters. */
type Bus = { serials: string[]; drives?: string[] };

/**
 * Asks the system once for everything a look needs. On Windows that is one
 * PowerShell, for the Kindle serials and the removable drives together, so
 * nothing has to try every drive letter.
 */
async function readBus(): Promise<Bus> {
  if (process.platform === "darwin") {
    const { stdout } = await run("/usr/sbin/ioreg", ["-p", "IOUSB", "-l", "-w0"], { timeout: 4000, maxBuffer: 8 << 20 });
    const serials = stdout
      .split("+-o ")
      .filter((block) => new RegExp(`"idVendor" = ${AMAZON}\\b`).test(block))
      .map((block) => block.match(/"(?:USB Serial Number|kUSBSerialNumberString)" = "([^"]+)"/)?.[1] ?? "")
      .filter(Boolean);
    return { serials };
  }
  if (process.platform === "win32") {
    const script = [
      "$s = Get-PnpDevice -PresentOnly -InstanceId 'USB\\VID_1949*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty InstanceId",
      "$d = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DeviceID",
      "'S=' + ($s -join '|')",
      "'D=' + ($d -join '|')",
    ].join("; ");
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 8000, windowsHide: true });
    const line = (key: string) => (stdout.split(/\r?\n/).find((l) => l.startsWith(`${key}=`)) ?? "").slice(2).split("|").filter(Boolean);
    return {
      // USB\VID_1949&PID_0004\G0XXXXXXXXXXXXXX. Composite parts carry a made-up id with & in it.
      serials: line("S").map((id) => id.trim().split("\\").pop() ?? "").filter((id) => id && !id.includes("&")),
      drives: line("D").map((letter) => `${letter.trim()}\\`),
    };
  }
  const base = "/sys/bus/usb/devices";
  const serials: string[] = [];
  for (const name of await readdir(base).catch(() => [] as string[])) {
    const vendor = await readFile(join(base, name, "idVendor"), "utf8").catch(() => "");
    if (parseInt(vendor, 16) !== AMAZON) continue;
    const serial = (await readFile(join(base, name, "serial"), "utf8").catch(() => "")).trim();
    if (serial) serials.push(serial);
  }
  return { serials };
}

/** A device names its own serial, so one that isn't short and plain doesn't count. */
export const toKindles = (serials: string[]): KindleOnUsb[] =>
  [...new Set(serials)].filter((serial) => /^[\x21-\x7e]{1,64}$/.test(serial)).map((serial) => ({ serial, model: kindleFromSerial(serial)?.id }));

/** Folders a Kindle could be mounted at. */
async function mountPoints(bus: Bus): Promise<string[]> {
  if (process.platform === "darwin") return (await readdir("/Volumes").catch(() => [] as string[])).map((n) => join("/Volumes", n));
  if (process.platform === "win32") {
    if (bus.drives) return bus.drives;
    // Without PowerShell, every letter, each given a moment and no more.
    return [..."DEFGHIJKLMNOPQRSTUVWXYZ"].map((letter) => `${letter}:\\`);
  }
  const user = process.env.USER ?? "";
  const out: string[] = [];
  for (const base of [`/media/${user}`, `/run/media/${user}`]) out.push(...(await readdir(base).catch(() => [] as string[])).map((n) => join(base, n)));
  return out;
}

/**
 * Which e-reader a drive is, by the folders it keeps. A Kindle has documents
 * and system folders, a Kobo its hidden .kobo folder, and a PocketBook its
 * settings in system/config.
 */
export async function readerOn(root: string): Promise<ReaderKind | "kindle" | null> {
  // A Kobo is a Kobo whatever folders someone made on it.
  if (await exists(join(root, ".kobo"))) return "kobo";
  if ((await exists(join(root, "documents"))) && ((await exists(join(root, "system"))) || /kindle/i.test(basename(root)))) return "kindle";
  if (await exists(join(root, "system", "config"))) return "pocketbook";
  return null;
}

/**
 * E-readers plugged in as a drive, Kindles first. On macOS they mount under
 * /Volumes, on Windows as removable drives.
 */
async function drivesOn(bus: Bus): Promise<KindleDevice[]> {
  const usb = toKindles(bus.serials);
  const roots = await mountPoints(bus);
  const found = await Promise.all(
    roots.map(async (root): Promise<KindleDevice | null> => {
      // The Mac's own disk is in /Volumes too, as a link to /.
      if (process.platform === "darwin" && (await lstat(root).catch(() => null))?.isSymbolicLink()) return null;
      const kind = await readerOn(root);
      if (!kind) return null;
      const fs = await statfs(root).catch(() => null);
      const free = fs ? fs.bavail * fs.bsize : 0;
      const letter = root.replace(/\\$/, "");
      if (kind !== "kindle") return { name: process.platform === "win32" ? `${READERS[kind].name} (${letter})` : basename(root), path: root, free, kind };
      return {
        name: process.platform === "win32" ? `Kindle (${letter})` : basename(root),
        path: root,
        free,
        // Which drive is which Kindle can't be told apart, so a model is only named when there is one.
        model: usb.length === 1 ? usb[0].model : undefined,
      };
    }),
  );
  return found.filter((d): d is KindleDevice => d !== null).sort((a, b) => Number(Boolean(a.kind)) - Number(Boolean(b.kind)));
}

const safeBus = () => readBus().catch((): Bus => ({ serials: [] }));

/** The drives last seen, so checking one doesn't mean asking the system all over again. */
let lastDrives: KindleDevice[] = [];

/** Kindles that take books by cable: ones that open as a drive, and ones open over MTP. */
export async function findDevices(): Promise<KindleDevice[]> {
  const drives = await drivesOn(await safeBus());
  lastDrives = drives;
  return drives.some((d) => !d.kind) ? drives : [...readyDevices(), ...drives];
}

/**
 * The Kindles plugged in, with their model when Shelfed knows it. Newer Kindles
 * don't show up as a drive, but they are still on the bus.
 */
export async function kindlesOnUsb(): Promise<KindleOnUsb[]> {
  return toKindles((await safeBus()).serials);
}

let looking: Promise<{ usb: KindleOnUsb[]; drives: KindleDevice[] }> | null = null;

/**
 * Everything about the Kindles plugged in, from one look at the system. Asked
 * again while a look is still going, it shares that look rather than start another.
 */
export function kindlePort() {
  looking ??= (async () => {
    const bus = await safeBus();
    const usb = toKindles(bus.serials);
    const drives = await drivesOn(bus);
    lastDrives = drives;
    // A Kindle open as a drive needs nothing more. Any other gets its MTP looked at.
    const asDrive = drives.some((d) => !d.kind);
    const linked = look(asDrive ? [] : usb);
    return asDrive ? { usb, drives } : { usb: linked.usb, drives: [...linked.devices, ...drives] };
  })().finally(() => (looking = null));
  return looking;
}

/** The clippings file every Kindle keeps, from each one plugged in. */
export async function readClippings(): Promise<Array<{ device: string; text: string }>> {
  const out: Array<{ device: string; text: string }> = [];
  for (const device of await findDevices()) {
    const file = join(device.path, "documents", "My Clippings.txt");
    if (isMtpPath(device.path) || device.kind) continue;
    if (existsSync(file)) out.push({ device: device.name, text: await readFile(file, "utf8") });
  }
  out.push(...(await mtpClippings()));
  return out;
}

/** Whether a book on a Kindle plugged in as a drive is locked to it. */
export async function isLocked(path: string): Promise<boolean> {
  const file = await open(path, "r").catch(() => null);
  try {
    return await lockedBy(path, async (offset, length) => {
      if (!file) return null;
      const bytes = Buffer.alloc(length);
      const { bytesRead } = await file.read(bytes, 0, length, offset);
      return bytes.subarray(0, bytesRead);
    });
  } catch {
    return false;
  } finally {
    await file?.close();
  }
}

/** For the demos and tests: drives to take as plugged in, without asking the system. */
export function asIfPlugged(drives: KindleDevice[]) {
  lastDrives = drives;
}

/** Which e-reader a drive seen plugged in is, when it isn't a Kindle. */
const kindOf = (device: string) => lastDrives.find((d) => d.path === device)?.kind;

/** Where a drive keeps its books: a Kindle's documents folder, or the top of any other e-reader. */
const booksIn = (device: string) => (kindOf(device) ? resolve(device) : resolve(device, "documents"));

/** A path a page gave, as a book file inside a drive's books, or null when it isn't one. */
function bookPath(device: string, file: string) {
  const books = booksIn(device);
  const path = resolve(books, file);
  const inside = relative(books, path);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) return null;
  const kind = kindOf(device);
  if (!kind) return isBookFile(path) ? path : null;
  // Another e-reader's own folders aren't for Shelfed to touch, nor anything hidden.
  const parts = inside.split(sep);
  return isReaderBook(path) && !READERS[kind].own.test(parts[0]) && !parts.some((part) => part.startsWith(".")) ? path : null;
}

/** What was found locked, by path, size and time, so a file is only looked inside once. */
const lockedCache = new Map<string, boolean>();

/**
 * The book files on an e-reader, a few folders deep, with their sizes and
 * whether they're locked to it: in a Kindle's documents folder, or anywhere
 * on another e-reader outside its own folders. Kindles keep each book's notes
 * in a .sdr folder beside it; those are skipped.
 */
export async function deviceFiles(device: string): Promise<KindleFile[]> {
  if (isMtpPath(device)) return mtpFiles(device);
  const found: KindleFile[] = [];
  const books = booksIn(device);
  const kind = kindOf(device);
  const walk = async (dir: string, depth: number) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const own = entry.name.startsWith(".") || entry.name.endsWith(".sdr") || (kind && depth === 0 && READERS[kind].own.test(entry.name));
        if (depth < 3 && !own) await walk(path, depth + 1);
      } else if (entry.isFile() && (kind ? isReaderBook(entry.name) : isBookFile(entry.name)) && !entry.name.startsWith(".")) {
        const info = await stat(path).catch(() => null);
        const size = info?.size ?? 0;
        const key = `${path}\0${size}\0${info?.mtimeMs ?? 0}`;
        let locked = lockedCache.get(key);
        if (locked === undefined) lockedCache.set(key, (locked = await isLocked(path)));
        found.push({ name: entry.name, path: relative(books, path).split(sep).join("/"), size, ...(locked ? { locked } : {}) });
      }
    }
  };
  await walk(books, 0);
  return found;
}

/**
 * Takes books off an e-reader plugged in as a drive, a Kindle's with the notes
 * folder it keeps beside each. Only its book files go; anything else asked
 * for is left. An e-reader has no Trash, so they're gone from it, but stay in
 * the library. Returns how many bytes were freed.
 */
export async function removeFromDevice(device: string, files: string[]): Promise<number> {
  if (isMtpPath(device)) return mtpRemove(device, files);
  let freed = 0;
  for (const file of files) {
    const path = bookPath(device, file);
    if (!path) continue;
    const size = (await stat(path).catch(() => null))?.size ?? 0;
    await rm(path, { force: true });
    if (!kindOf(device)) await rm(path.replace(/\.[^.\\/]+$/, ".sdr"), { recursive: true, force: true });
    freed += size;
  }
  return freed;
}

export async function copyToDevice(device: string, file: string, name: string, progress?: (fraction: number) => void) {
  if (isMtpPath(device)) return mtpCopy(device, file, name, (await stat(file)).size, progress);
  const books = booksIn(device);
  await mkdir(books, { recursive: true });
  const target = join(books, name);
  await copyFile(file, target);
  return (await stat(target)).size;
}

/**
 * Files on an e-reader as paths on this computer, to bring them into the library.
 * A drive's are there already; a Kindle over MTP has them copied off first, each to
 * a temporary folder to be forgotten once they're in. Gives back whether to.
 */
export async function filesFromDevice(device: string, files: string[], progress?: (fraction: number) => void) {
  if (isMtpPath(device)) return { paths: await mtpFetch(device, files, progress), temporary: true };
  const paths = files.map((file) => {
    const path = bookPath(device, file);
    if (!path) throw new Error(kindOf(device) ? t("That file isn't on your e-reader.") : t("That file isn't on your Kindle."));
    return path;
  });
  return { paths, temporary: false };
}

/**
 * Whether a path is a Kindle plugged in right now. What the page asks to read
 * or change on a Kindle goes through this first, so that it can only ever be
 * a Kindle, never somewhere else on this computer.
 */
export async function isPluggedIn(device: string) {
  if (isMtpPath(device)) return readyDevices().some((d) => d.path === device);
  const known = (list: KindleDevice[]) => list.some((d) => d.path === device);
  return known(lastDrives) || known(await findDevices());
}
