import { createSocket } from "node:dgram";
import { createReadStream } from "node:fs";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { isReaderBook, READERS } from "../shared/ereaders";
import type { KindleDevice, KindleFile } from "../shared/types";
import { isSafeName } from "./kindle-files";
import { t } from "../shared/i18n";

/*
 * Xteink readers running CrossPoint, over Wi-Fi. While its File Transfer
 * screen is open, a reader runs a small web server, documented in CrossPoint's
 * docs/webserver-endpoints.md, and answers "hello" on UDP port 8134 so it can
 * be found. Shelfed asks only when looking for e-readers on Wi-Fi is turned
 * on, and only talks to the readers that answered, or the address you gave.
 */

const PREFIX = "crosspoint://";
const DISCOVERY_PORT = 8134;
/** Where books go on the reader, as CrossPoint's own docs show. */
const BOOKS = "/Books";
/** A reader that stops answering is taken as gone after this long: its File Transfer screen was closed. */
const GONE = 12_000;
/** How often the network is asked again, at most. */
const ASK_EVERY = 4_000;

export const isCrossPointPath = (path: string) => path.startsWith(PREFIX);

/** An address a reader can be at: a name or an IPv4 address, with a port if it isn't 80. Nothing that could be a path or a URL of its own. */
const ADDRESS = /^(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)*)(?::\d{1,5})?$/i;
export const isAddress = (host: string) => ADDRESS.test(host) && host.length <= 260;

type Found = { host: string; name: string; seen: number; model?: string };

/** Readers that answered, by host. */
const found = new Map<string, Found>();
let lastAsked = 0;

/** Where the network can be shouted to: every IPv4 network this computer is on, and everyone. */
function broadcasts() {
  const out = new Set(["255.255.255.255"]);
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family !== "IPv4" || net.internal) continue;
      const ip = net.address.split(".").map(Number);
      const mask = net.netmask.split(".").map(Number);
      out.add(ip.map((part, i) => (part | (~mask[i] & 255)) >>> 0).join("."));
    }
  }
  return [...out];
}

/** "crosspoint (on reader);81", the answer a reader gives to hello. */
export function parseHello(text: string) {
  const match = /^crosspoint \(on (.{1,63})\);(\d{1,5})$/.exec(text.trim());
  return match ? { name: match[1] } : null;
}

/** Says hello to the network and gathers the readers that answer within a moment. */
function hello(wait = 1200): Promise<Array<{ host: string; name: string }>> {
  return new Promise((done) => {
    const answers: Array<{ host: string; name: string }> = [];
    const socket = createSocket("udp4");
    const finish = () => {
      try {
        socket.close();
      } catch {
        // Closed already.
      }
      done(answers);
    };
    socket.on("error", finish);
    socket.on("message", (data, from) => {
      const answer = parseHello(data.toString("utf8"));
      if (answer && !answers.some((a) => a.host === from.address)) answers.push({ host: from.address, name: answer.name });
    });
    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        return finish();
      }
      for (const address of broadcasts()) socket.send("hello", DISCOVERY_PORT, address, () => undefined);
      setTimeout(finish, wait);
    });
  });
}

type Status = { firmwareFamily?: string; device?: string };

/** Asks a reader how it is. Null when what answered isn't CrossPoint. */
async function status(host: string, timeout = 2500): Promise<Status | null> {
  try {
    const res = await fetch(`http://${host}/api/status`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const body = (await res.json()) as Status;
    return body && body.firmwareFamily === "crosspoint" ? body : null;
  } catch {
    return null;
  }
}

const modelName = (device?: string) => (device === "X3" || device === "X4" ? `Xteink ${device}` : undefined);

/**
 * Looks for readers, at most every few seconds however often it's asked: on
 * the network, and at the address given, if any. What it finds lasts until a
 * reader stops answering.
 */
export async function lookForReaders(address?: string) {
  const now = Date.now();
  if (now - lastAsked < ASK_EVERY) return;
  lastAsked = now;
  const tries: Array<Promise<void>> = [];
  const keep = async (host: string, name: string) => {
    const known = found.get(host);
    const info = known?.model ? null : await status(host);
    if (!known && !info) return;
    found.set(host, { host, name, seen: Date.now(), model: known?.model ?? modelName(info?.device ?? undefined) });
  };
  // Tests point at a pretend reader, and have no business shouting at the network.
  if (!process.env.SHELF_NO_HELLO) tries.push(hello().then((answers) => Promise.all(answers.map((a) => keep(a.host, a.name))).then(() => undefined)));
  const typed = address?.trim();
  if (typed && isAddress(typed)) {
    tries.push(
      status(typed).then((info) => {
        if (info) found.set(typed, { host: typed, name: typed.replace(/:\d+$/, ""), seen: Date.now(), model: modelName(info.device) });
      }),
    );
  }
  await Promise.all(tries);
}

/** The readers that answered lately, as e-readers like any other. */
export function wifiReaders(): KindleDevice[] {
  const now = Date.now();
  const out: KindleDevice[] = [];
  for (const [host, reader] of found) {
    if (now - reader.seen > GONE) {
      found.delete(host);
      continue;
    }
    out.push({ name: reader.model ?? READERS.crosspoint.name, path: PREFIX + host, free: 0, kind: "crosspoint" });
  }
  return out;
}

/** Stops listing readers, when looking is turned off. */
export function forgetReaders() {
  found.clear();
  lastAsked = 0;
}

/** For tests: a reader at an address, taken as found. */
export function asIfFound(host: string, model?: string) {
  found.set(host, { host, name: host, seen: Date.now() + 10 * 365 * 86_400_000, model });
}

/** The host a device path names, checked again, since paths come from the page. */
function hostOf(device: string) {
  const host = device.slice(PREFIX.length);
  if (!isCrossPointPath(device) || !isAddress(host)) throw new Error(t("That e-reader isn't plugged in any more."));
  return host;
}

export const isFound = (device: string) => isCrossPointPath(device) && found.has(device.slice(PREFIX.length));

/** A path on the reader's card, from one Shelfed listed: plain names only, never its own folders, and a book. */
function cardPath(file: string) {
  const parts = file.replace(/^\/+/, "").split("/");
  if (!parts.every(isSafeName) || READERS.crosspoint.own.test(parts[0]) || !isReaderBook(file)) return null;
  return "/" + parts.join("/");
}

/** Plain words for what went wrong talking to a reader. */
function plainError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|timeout|aborted|socket hang up|ECONNRESET/i.test(message))
    return new Error(t("Your CrossPoint reader stopped answering. Check its File Transfer screen is still open."));
  return error instanceof Error ? error : new Error(message);
}

/** A reader that answered anything is still there, even one too busy taking a book to answer hello. */
function answered(host: string) {
  const reader = found.get(host);
  if (reader) reader.seen = Math.max(reader.seen, Date.now());
}

async function get(host: string, path: string, timeout = 15_000) {
  const res = await fetch(`http://${host}${path}`, { signal: AbortSignal.timeout(timeout) });
  answered(host);
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  return res;
}

async function post(host: string, path: string, form: Record<string, string>) {
  const res = await fetch(`http://${host}${path}`, { method: "POST", body: new URLSearchParams(form), signal: AbortSignal.timeout(15_000) });
  answered(host);
  return { ok: res.ok, text: await res.text().catch(() => "") };
}

type Entry = { name: string; size: number; isDirectory: boolean };

/** The books on a reader's card, a few folders deep, outside its own folders. */
export async function crossPointFiles(device: string): Promise<KindleFile[]> {
  const host = hostOf(device);
  const out: KindleFile[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries: Entry[];
    try {
      entries = (await (await get(host, `/api/files?path=${encodeURIComponent(dir)}`)).json()) as Entry[];
    } catch (error) {
      if (depth === 0) throw plainError(error);
      return;
    }
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || typeof entry.name !== "string" || !isSafeName(entry.name) || entry.name.startsWith(".")) continue;
      const path = dir === "/" ? entry.name : `${dir.slice(1)}/${entry.name}`;
      if (entry.isDirectory) {
        if (depth < 3 && !(depth === 0 && READERS.crosspoint.own.test(entry.name))) await walk("/" + path, depth + 1);
      } else if (isReaderBook(entry.name)) out.push({ name: entry.name, path, size: Number(entry.size) || 0 });
    }
  };
  await walk("/", 0);
  return out;
}

/** The body of a form with one file in it, sent a piece at a time so progress can be told. */
function upload(host: string, path: string, file: string, name: string, size: number, progress?: (fraction: number) => void): Promise<string> {
  const boundary = `----shelfed${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  // The name goes in quoted, with what would end the quotes taken out.
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name.replace(/["\r\n\\]/g, "_")}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const [hostname, port] = host.split(":");
  return new Promise((done, fail) => {
    const req = request(
      { hostname, port: port ? Number(port) : 80, path, method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": head.length + size + tail.length } },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => ((res.statusCode ?? 500) < 300 ? done(text) : fail(new Error(text.trim() || `HTTP ${res.statusCode}`))));
      },
    );
    // A reader works slowly, but one silent for a minute has gone.
    req.setTimeout(60_000, () => req.destroy(new Error("timeout")));
    req.on("error", fail);
    req.write(head);
    let sent = 0;
    const stream = createReadStream(file, { highWaterMark: 32 * 1024 });
    stream.on("data", (chunk) => {
      sent += chunk.length;
      answered(host);
      progress?.(Math.min(0.99, sent / Math.max(1, size)));
      if (!req.write(chunk)) {
        stream.pause();
        req.once("drain", () => stream.resume());
      }
    });
    stream.on("error", (error) => req.destroy(error));
    stream.on("end", () => req.end(tail));
  });
}

/** Sends a book to a reader's Books folder, in place of one of the same name. Gives back its size. */
export async function crossPointCopy(device: string, file: string, name: string, progress?: (fraction: number) => void) {
  const host = hostOf(device);
  if (!isSafeName(name)) throw new Error(t("That file isn't on your e-reader."));
  const size = (await stat(file)).size;
  try {
    // Made if it isn't there; a reader says no when it is, which is fine.
    await post(host, "/mkdir", { name: BOOKS.slice(1), path: "/" });
    await upload(host, `/upload?path=${encodeURIComponent(BOOKS)}&overwrite=1`, file, name, size, progress);
  } catch (error) {
    throw plainError(error);
  }
  progress?.(1);
  return size;
}

/** Takes books off a reader. Only book files outside its own folders go. Gives back how many bytes that freed. */
export async function crossPointRemove(device: string, files: string[]) {
  const host = hostOf(device);
  const listed = await crossPointFiles(device);
  const sizes = new Map(listed.map((f) => [f.path, f.size]));
  const paths = files.filter((f) => sizes.has(f.replace(/^\/+/, ""))).map(cardPath).filter((p): p is string => Boolean(p));
  if (!paths.length) return 0;
  const res = await post(host, "/delete", { paths: JSON.stringify(paths) }).catch((error) => {
    throw plainError(error);
  });
  if (!res.ok) throw new Error(res.text.trim() || t("That file isn't on your e-reader."));
  return paths.reduce((sum, p) => sum + (sizes.get(p.slice(1)) ?? 0), 0);
}

/** Copies books off a reader into a folder of their own, to bring them into the library. */
export async function crossPointFetch(device: string, files: string[], progress?: (fraction: number) => void) {
  const host = hostOf(device);
  const folder = await mkdtemp(join(tmpdir(), "shelfed-crosspoint-"));
  const out: string[] = [];
  for (const [i, file] of files.entries()) {
    const path = cardPath(file);
    if (!path) throw new Error(t("That file isn't on your e-reader."));
    try {
      const res = await get(host, `/download?path=${encodeURIComponent(path)}`, 120_000);
      const target = join(folder, `${i}-${path.split("/").pop()}`);
      await writeFile(target, Buffer.from(await res.arrayBuffer()));
      out.push(target);
    } catch (error) {
      throw plainError(error);
    }
    progress?.((i + 1) / files.length);
  }
  return out;
}

/** The highlights a reader keeps, in the Kindle's own format, from every reader found. */
export async function crossPointClippings(): Promise<Array<{ device: string; text: string }>> {
  const out: Array<{ device: string; text: string }> = [];
  for (const reader of wifiReaders()) {
    try {
      const res = await get(hostOf(reader.path), `/download?path=${encodeURIComponent("/My Clippings.txt")}`);
      out.push({ device: reader.name, text: await res.text() });
    } catch {
      // No highlights yet, or it went away.
    }
  }
  return out;
}
