import { access, copyFile, mkdir, open, readdir, readFile, rm, stat, statfs } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import nodemailer from "nodemailer";
import { kindleFromSerial } from "../shared/kindles";
import type { KindleDevice, KindleFile, KindleOnUsb, KindleSettings } from "../shared/types";
import { getSmtpPassword } from "./settings";
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

const toKindles = (serials: string[]): KindleOnUsb[] => [...new Set(serials)].map((serial) => ({ serial, model: kindleFromSerial(serial)?.id }));

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
 * A Kindle shows up as a drive with a documents folder and a system folder.
 * On macOS it mounts under /Volumes, on Windows as a removable drive.
 */
async function drivesOn(bus: Bus): Promise<KindleDevice[]> {
  const usb = toKindles(bus.serials);
  const roots = await mountPoints(bus);
  const found = await Promise.all(
    roots.map(async (root): Promise<KindleDevice | null> => {
      if (!(await exists(join(root, "documents")))) return null;
      if (!(await exists(join(root, "system"))) && !/kindle/i.test(basename(root))) return null;
      const fs = await statfs(root).catch(() => null);
      return {
        name: process.platform === "win32" ? `Kindle (${root.replace(/\\$/, "")})` : basename(root),
        path: root,
        free: fs ? fs.bavail * fs.bsize : 0,
        // Which drive is which Kindle can't be told apart, so a model is only named when there is one.
        model: usb.length === 1 ? usb[0].model : undefined,
      };
    }),
  );
  return found.filter((d): d is KindleDevice => d !== null);
}

const safeBus = () => readBus().catch((): Bus => ({ serials: [] }));

/** Kindles that open as a drive, so books can be copied straight on. */
export async function findDevices(): Promise<KindleDevice[]> {
  return drivesOn(await safeBus());
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
    return { usb: toKindles(bus.serials), drives: await drivesOn(bus) };
  })().finally(() => (looking = null));
  return looking;
}

/** The clippings file every Kindle keeps, from each one plugged in. */
export async function readClippings(): Promise<Array<{ device: string; text: string }>> {
  const out: Array<{ device: string; text: string }> = [];
  for (const device of await findDevices()) {
    const file = join(device.path, "documents", "My Clippings.txt");
    if (existsSync(file)) out.push({ device: device.name, text: await readFile(file, "utf8") });
  }
  return out;
}

/** What a Kindle can read, the files worth matching against a library. */
const ON_DEVICE = /\.(azw3?|kfx|mobi|prc|pdf|txt|epub|docx)$/i;

/** The Kindle's own file of every highlight and note: never a book, never removed. */
const CLIPPINGS = /^my clippings\.txt$/i;
const isBookFile = (path: string) => ON_DEVICE.test(path) && !CLIPPINGS.test(basename(path));

/** The Kindle formats Shelfed reads when no DRM locks them. */
const MOBI = /\.(azw3?|mobi|prc|kf8)$/i;

/**
 * Whether a book on a Kindle is locked to it. Books bought from Amazon come
 * as KFX, which only a Kindle reads, as Topaz, or as MOBI with DRM, which the
 * header of its first record says. Books put on it by cable or email aren't.
 */
export async function isLocked(path: string): Promise<boolean> {
  if (/\.kfx$/i.test(path)) return true;
  if (!MOBI.test(path)) return false;
  const file = await open(path, "r").catch(() => null);
  if (!file) return false;
  try {
    const head = Buffer.alloc(82);
    if ((await file.read(head, 0, 82, 0)).bytesRead < 82) return false;
    if (head.toString("latin1", 0, 3) === "TPZ") return true;
    if (head.toString("latin1", 60, 68) !== "BOOKMOBI") return false;
    // The first record starts with the PalmDOC header; its seventh field is the encryption.
    const doc = Buffer.alloc(14);
    if ((await file.read(doc, 0, 14, head.readUInt32BE(78))).bytesRead < 14) return false;
    return doc.readUInt16BE(12) !== 0;
  } catch {
    return false;
  } finally {
    await file.close();
  }
}

/** What was found locked, by path, size and time, so a file is only looked inside once. */
const lockedCache = new Map<string, boolean>();

/**
 * The book files in a Kindle's documents folder, a few folders deep, with
 * their sizes and whether they're locked to it. Kindles keep each book's
 * notes in a .sdr folder beside it; those are skipped.
 */
export async function deviceFiles(device: string): Promise<KindleFile[]> {
  const found: KindleFile[] = [];
  const docs = join(device, "documents");
  const walk = async (dir: string, depth: number) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && depth < 3 && !entry.name.endsWith(".sdr") && !entry.name.startsWith(".")) await walk(path, depth + 1);
      else if (entry.isFile() && isBookFile(entry.name)) {
        const info = await stat(path).catch(() => null);
        const size = info?.size ?? 0;
        const key = `${path}\0${size}\0${info?.mtimeMs ?? 0}`;
        let locked = lockedCache.get(key);
        if (locked === undefined) lockedCache.set(key, (locked = await isLocked(path)));
        found.push({ name: entry.name, path: relative(docs, path).split(sep).join("/"), size, ...(locked ? { locked } : {}) });
      }
    }
  };
  await walk(docs, 0);
  return found;
}

/**
 * Takes books off a Kindle plugged in as a drive, each with the notes folder
 * the Kindle keeps beside it. Only book files inside its documents folder go;
 * anything else asked for is left. A Kindle has no Trash, so they're gone
 * from it, but stay in the library. Returns how many bytes were freed.
 */
export async function removeFromDevice(device: string, files: string[]): Promise<number> {
  const docs = resolve(device, "documents");
  let freed = 0;
  for (const file of files) {
    const path = resolve(docs, file);
    const inside = relative(docs, path);
    if (!inside || inside.startsWith("..") || isAbsolute(inside) || !isBookFile(path)) continue;
    const size = (await stat(path).catch(() => null))?.size ?? 0;
    await rm(path, { force: true });
    await rm(path.replace(/\.[^.\\/]+$/, ".sdr"), { recursive: true, force: true });
    freed += size;
  }
  return freed;
}

export async function copyToDevice(device: string, file: string, name: string) {
  const docs = join(device, "documents");
  await mkdir(docs, { recursive: true });
  const target = join(docs, name);
  await copyFile(file, target);
  return (await stat(target)).size;
}
