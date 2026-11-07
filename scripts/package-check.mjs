/*
 * Looks inside every packed app in dist, without starting it, and fails if it
 * doesn't hold what reaching a Kindle needs, or its lockdown isn't on.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import asar from "@electron/asar";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const problems = [];
const need = (ok, what) => void (ok || problems.push(what));

/** The first bytes of a file, to tell what kind of program it really is. */
function start(path, length = 4) {
  const file = openSync(path, "r");
  const bytes = Buffer.alloc(length);
  readSync(file, bytes, 0, length, 0);
  closeSync(file);
  return bytes;
}

function checkFuses(app, label) {
  const out = execFileSync(process.execPath, [join(root, "node_modules/@electron/fuses/dist/bin.js"), "read", "--app", app], { encoding: "utf8" });
  for (const fuse of ["RunAsNode", "EnableNodeOptionsEnvironmentVariable", "EnableNodeCliInspectArguments"]) need(new RegExp(`${fuse} is Disabled`).test(out), `${label}: ${fuse} isn't off`);
  for (const fuse of ["OnlyLoadAppFromAsar", "EnableEmbeddedAsarIntegrityValidation"]) need(new RegExp(`${fuse} is Enabled`).test(out), `${label}: ${fuse} isn't on`);
}

const has = (list, path) => list.some((entry) => entry.replaceAll("\\", "/").includes(path));

function checkMac(app, arch) {
  const resources = join(app, "Contents", "Resources");
  const list = asar.listPackage(join(resources, "app.asar"));
  need(has(list, "/out/main/index.js"), `${app}: no app in its archive`);
  need(has(list, "/node_modules/usb/"), `${app}: no USB library`);
  const native = join(resources, "app.asar.unpacked", "node_modules", "usb", `usb.darwin-${arch}.node`);
  need(existsSync(native), `${app}: no USB library for ${arch}, unpacked where it can load`);
  checkFuses(app, app);
}

function checkWindows(dir) {
  const resources = join(dir, "resources");
  const list = asar.listPackage(join(resources, "app.asar"));
  need(has(list, "/out/main/index.js"), `${dir}: no app in its archive`);
  const helper = join(resources, "kindle-wpd.exe");
  need(existsSync(helper), `${dir}: no Kindle helper`);
  if (existsSync(helper)) {
    need(start(helper, 2).toString("latin1") === "MZ", `${dir}: the Kindle helper isn't a Windows program`);
    need(statSync(helper).size > 500_000, `${dir}: the Kindle helper is too small to be real`);
  }
  need(!has(list, "/node_modules/usb/"), `${dir}: holds the USB library it never uses`);
  checkFuses(join(dir, "Shelfed.exe"), dir);
}

let found = 0;
for (const name of readdirSync(dist)) {
  const dir = join(dist, name);
  if (name === "win-unpacked") {
    found++;
    checkWindows(dir);
  } else if (/^mac(-arm64|-x64)?$/.test(name)) {
    found++;
    checkMac(join(dir, "Shelfed.app"), name === "mac-arm64" ? "arm64" : "x64");
  }
}
need(found > 0, "No packed apps to check");
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${found} packed app(s) hold what they should, with their lockdown on`);
