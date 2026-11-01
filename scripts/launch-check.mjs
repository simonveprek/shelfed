/*
 * Starts the packed app the way someone would, and checks it stays up and gets
 * as far as running its own code. With Electron's lockdown switches on, a build
 * that went wrong refuses to start at all, and no other check would notice.
 *
 * Opens a real window, so it's for CI, not for a computer someone is using.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dist = resolve(import.meta.dirname, "..", "dist");
const candidates = process.platform === "win32" ? [join(dist, "win-unpacked", "Shelfed.exe")] : [`mac-${process.arch}`, "mac", "mac-arm64"].map((dir) => join(dist, dir, "Shelfed.app", "Contents", "MacOS", "Shelfed"));
const app = candidates.find(existsSync);
if (!app) throw new Error(`No packed app in ${dist}`);

const data = mkdtempSync(join(tmpdir(), "shelf-launch-"));
const child = spawn(app, [], { env: { ...process.env, SHELF_USERDATA: data }, stdio: "ignore" });
let exited = null;
child.on("exit", (code, signal) => (exited = { code, signal }));

const until = Date.now() + 60_000;
let started = false;
while (Date.now() < until && !exited && !started) {
  await new Promise((r) => setTimeout(r, 500));
  // The app's own code writes its settings and logs here, so anything in the folder means it ran.
  started = readdirSync(data).length > 0;
}
if (started) await new Promise((r) => setTimeout(r, 5000));
const fine = started && !exited;
child.kill();
await new Promise((r) => setTimeout(r, 1000));
rmSync(data, { recursive: true, force: true, maxRetries: 5 });
if (!fine) {
  console.error(`${app} didn't start properly`, exited ?? "and wrote nothing");
  process.exit(1);
}
console.log(`${app} started and stayed up`);
