import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";
import { NoMtp, type Backend, type Entry, type Storage } from "./kindle";

/*
 * Reaching a Kindle on Windows. Windows gives MTP devices to its own driver, so
 * nothing can talk to them over plain USB; programs go through its portable
 * devices service instead, which is a COM API. tools/kindle-wpd is a small
 * helper that does that, and this talks to it, a line of JSON at a time.
 */

export type HelperLink = { write(line: string): void; onLine(listener: (line: string) => void): void; onEnd(listener: (reason: string) => void): void; stop(): void };

type Waiting = { resolve(value: unknown): void; reject(error: Error): void; progress?: (done: number) => void };

const AMAZON = /vid_1949/i;
/** How long the helper may stay silent before it's taken to be stuck. It reports as it goes on anything long. */
const QUIET = 120_000;

/** A running helper, with each request matched to its answer. */
export class Helper {
  private next = 1;
  private waiting = new Map<number, Waiting>();
  private ended: string | null = null;
  private watchdog?: ReturnType<typeof setTimeout>;

  constructor(private link: HelperLink) {
    link.onLine((line) => this.answer(line));
    link.onEnd((reason) => this.end(reason));
  }

  private end(reason: string) {
    clearTimeout(this.watchdog);
    this.ended ??= reason;
    for (const waiting of this.waiting.values()) waiting.reject(new Error(this.ended));
    this.waiting.clear();
  }

  /** A stuck helper must not hold the Kindle up forever: everything behind it in the queue would wait too. */
  private watch() {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      this.end("The helper stopped answering");
      this.link.stop();
    }, QUIET);
    this.watchdog.unref?.();
  }

  private answer(line: string) {
    let message: { id: number; ok?: boolean; result?: unknown; error?: string; done?: number } | null;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    const waiting = this.waiting.get(message.id);
    if (!waiting) return;
    this.watch();
    if (message.done !== undefined) return waiting.progress?.(message.done);
    this.waiting.delete(message.id);
    if (!this.waiting.size) clearTimeout(this.watchdog);
    if (message.ok) waiting.resolve(message.result);
    else waiting.reject(new Error(message.error ?? "The helper gave no reason"));
  }

  ask<T>(cmd: string, args: Record<string, unknown> = {}, progress?: (done: number) => void): Promise<T> {
    if (this.ended) return Promise.reject(new Error(this.ended));
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(id, { resolve: resolve as (value: unknown) => void, reject, progress });
      this.watch();
      this.link.write(`${JSON.stringify({ id, cmd, args })}\n`);
    });
  }

  stop() {
    clearTimeout(this.watchdog);
    this.link.stop();
  }
}

/** The Windows device for a Kindle's serial: its id has the serial in it. With one Kindle plugged in, that one. */
export function pickDevice<T extends { id: string }>(devices: T[], serial: string) {
  const kindles = devices.filter((d) => AMAZON.test(d.id));
  return kindles.find((d) => d.id.toLowerCase().includes(serial.toLowerCase())) ?? (kindles.length === 1 ? kindles[0] : undefined);
}

export class WpdBackend implements Backend {
  constructor(private helper: Helper) {}
  storages() {
    return this.helper.ask<Storage[]>("storages");
  }
  children(storage: string, parent: string | null) {
    return this.helper.ask<Entry[]>("children", { parent: parent ?? storage });
  }
  makeFolder(storage: string, parent: string | null, name: string) {
    return this.helper.ask<string>("mkdir", { parent: parent ?? storage, name });
  }
  send(_storage: string, parent: string, name: string, file: string, size: number, progress?: (done: number) => void) {
    return this.helper.ask<string>("send", { parent, name, path: file, size }, progress);
  }
  async fetch(id: string, file: string, size: number, progress?: (done: number) => void) {
    await this.helper.ask("fetch", { id, path: file, size }, progress);
  }
  async read(id: string, offset: number, length: number) {
    const data = await this.helper.ask<string | null>("read", { id, offset, length });
    return data === null ? null : Buffer.from(data, "base64");
  }
  async remove(id: string) {
    await this.helper.ask("delete", { id });
  }
  async close() {
    await this.helper.ask("close").catch(() => {});
    this.helper.stop();
  }
}

/** Where the helper lives: with the app's resources, or where it's built while developing. */
const helperPath = () => (app.isPackaged ? join(process.resourcesPath, "kindle-wpd.exe") : resolve("resources", "kindle-wpd.exe"));

/** Starts the helper, or for the tests whatever program stands in for it. */
export function startHelper(path = helperPath(), args: string[] = []): Helper {
  if (!existsSync(path)) throw new Error(`No helper at ${path}`);
  const child = spawn(path, args, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
  // Writing to a helper that has just died is reported through its exit, not as a crash here.
  child.stdin.on("error", () => {});
  return new Helper({
    write: (line) => void child.stdin.write(line),
    onLine(listener) {
      let held = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        const lines = (held + chunk).split("\n");
        held = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) listener(line);
      });
    },
    onEnd(listener) {
      child.on("error", (error) => listener(error.message));
      child.on("exit", (code) => listener(`The helper stopped (${code})`));
    },
    stop: () => void child.kill(),
  });
}

/** Opens the Kindle with this serial through the helper. */
export async function connectWpd(serial: string, helper = startHelper()) {
  try {
    const device = pickDevice(await helper.ask<Array<{ id: string; name: string }>>("devices"), serial);
    if (!device) throw new NoMtp();
    await helper.ask("open", { id: device.id });
    // Windows' id for it holds the serial, so only the part before that goes in a report.
    return { backend: new WpdBackend(helper), about: `Windows portable device, ${device.name}, ${device.id.split("#").slice(0, 2).join("#")}` };
  } catch (error) {
    helper.stop();
    throw error;
  }
}
