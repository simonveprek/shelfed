import { copyFile, mkdir, readdir, readFile, stat, statfs } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, join } from "node:path";
import nodemailer from "nodemailer";
import { kindleFromSerial } from "../shared/kindles";
import type { KindleDevice, KindleOnUsb, KindleSettings } from "../shared/types";
import { getSmtpPassword } from "./settings";

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
  if (!settings.host || !settings.from) throw new Error("Set up sending in Settings first.");
  if (!password) throw new Error("Add your mail password in Settings.");
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user || settings.from, pass: password },
    connectionTimeout: 20_000,
  });
}

export async function verifyMail(settings: KindleSettings) {
  await transport(settings).verify();
  return true;
}

export async function sendToKindle(settings: KindleSettings, file: string, name: string, title: string) {
  if (!settings.to.trim()) throw new Error("Add your Send to Kindle address in Settings.");
  await transport(settings).sendMail({
    from: settings.from,
    to: settings.to.trim(),
    subject: title,
    text: `${title}, sent from Shelf.`,
    attachments: [{ filename: name, path: file }],
  });
}

/**
 * A Kindle shows up as a drive with a documents folder and a system folder.
 * On macOS it mounts under /Volumes, on Windows as a drive letter.
 */
export async function findDevices(): Promise<KindleDevice[]> {
  const roots: string[] = [];
  if (process.platform === "darwin") {
    const names = await readdir("/Volumes").catch(() => [] as string[]);
    roots.push(...names.map((n) => join("/Volumes", n)));
  } else if (process.platform === "win32") {
    for (const letter of "DEFGHIJKLMNOPQRSTUVWXYZ") roots.push(`${letter}:\\`);
  } else {
    const user = process.env.USER ?? "";
    for (const base of [`/media/${user}`, `/run/media/${user}`]) {
      const names = await readdir(base).catch(() => [] as string[]);
      roots.push(...names.map((n) => join(base, n)));
    }
  }
  const found: KindleDevice[] = [];
  const usb = await kindlesOnUsb();
  for (const root of roots) {
    if (!existsSync(join(root, "documents"))) continue;
    if (!existsSync(join(root, "system")) && !/kindle/i.test(basename(root))) continue;
    const fs = await statfs(root).catch(() => null);
    found.push({
      name: process.platform === "win32" ? `Kindle (${root.replace(/\\$/, "")})` : basename(root),
      path: root,
      free: fs ? fs.bavail * fs.bsize : 0,
      // Which drive is which Kindle can't be told apart, so a model is only named when there is one.
      model: usb.length === 1 ? usb[0].model : undefined,
    });
  }
  return found;
}

const run = promisify(execFile);
const AMAZON = 0x1949;

/** Serial numbers of the Kindles on the USB bus, read from the system's device list. */
async function usbSerials(): Promise<string[]> {
  if (process.platform === "darwin") {
    const { stdout } = await run("/usr/sbin/ioreg", ["-p", "IOUSB", "-l", "-w0"], { timeout: 4000, maxBuffer: 8 << 20 });
    return stdout
      .split("+-o ")
      .filter((block) => new RegExp(`"idVendor" = ${AMAZON}\\b`).test(block))
      .map((block) => block.match(/"(?:USB Serial Number|kUSBSerialNumberString)" = "([^"]+)"/)?.[1] ?? "")
      .filter(Boolean);
  }
  if (process.platform === "win32") {
    const { stdout } = await run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-PnpDevice -PresentOnly -InstanceId 'USB\\VID_1949*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty InstanceId"],
      { timeout: 8000, windowsHide: true },
    );
    // USB\VID_1949&PID_0004\G0XXXXXXXXXXXXXX. Composite parts carry a made-up id with & in it.
    return stdout.split(/\r?\n/).map((line) => line.trim().split("\\").pop() ?? "").filter((id) => id && !id.includes("&"));
  }
  const base = "/sys/bus/usb/devices";
  const out: string[] = [];
  for (const name of await readdir(base).catch(() => [] as string[])) {
    const vendor = await readFile(join(base, name, "idVendor"), "utf8").catch(() => "");
    if (parseInt(vendor, 16) !== AMAZON) continue;
    const serial = (await readFile(join(base, name, "serial"), "utf8").catch(() => "")).trim();
    if (serial) out.push(serial);
  }
  return out;
}

/**
 * The Kindles plugged in, with their model when Shelf knows it. Newer Kindles
 * don't show up as a drive, but they are still on the bus.
 */
export async function kindlesOnUsb(): Promise<KindleOnUsb[]> {
  const serials = await usbSerials().catch(() => [] as string[]);
  return [...new Set(serials)].map((serial) => ({ serial, model: kindleFromSerial(serial)?.id }));
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

export async function copyToDevice(device: string, file: string, name: string) {
  const docs = join(device, "documents");
  await mkdir(docs, { recursive: true });
  const target = join(docs, name);
  await copyFile(file, target);
  return (await stat(target)).size;
}
