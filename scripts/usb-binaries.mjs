/*
 * Puts the USB library's native file for both kinds of Mac beside it, so one
 * build makes both installers. npm only installs the one for the computer it's
 * on, and an Intel installer built on Apple silicon would otherwise have none.
 * Run before packaging for the Mac.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = join(root, "node_modules", "usb");
const { version } = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages;
for (const arch of ["arm64", "x64"]) {
  const dir = mkdtempSync(join(tmpdir(), "shelf-usb-"));
  try {
    const name = execFileSync("npm", ["pack", `@node-usb/usb-darwin-${arch}@${version}`, "--silent"], { cwd: dir, encoding: "utf8" }).trim().split("\n").pop();
    // Native code going into the app has to be exactly what the lock file recorded.
    const wanted = lock[`node_modules/@node-usb/usb-darwin-${arch}`]?.integrity;
    const got = `sha512-${createHash("sha512").update(readFileSync(join(dir, name))).digest("base64")}`;
    if (!wanted || got !== wanted) throw new Error(`The USB library for ${arch} doesn't match package-lock.json`);
    execFileSync("tar", ["-xzf", name], { cwd: dir });
    const file = readdirSync(join(dir, "package")).find((f) => f.endsWith(".node"));
    if (!file) throw new Error(`No native file for ${arch}`);
    copyFileSync(join(dir, "package", file), join(target, file));
    console.log(`usb: ${file}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
