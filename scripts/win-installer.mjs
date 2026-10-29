/*
 * Shelfed's own Windows installer: the window in tools/installer, with the
 * installer electron-builder makes carried inside it.
 *
 *   node scripts/win-installer.mjs [x64|arm64]
 *
 * Run after electron-builder has made dist/Shelfed-<version>-win-<arch>-setup.exe.
 * It makes dist/Shelfed-<version>-win-<arch>.exe, the file people download.
 * Needs Go. The release and the Screens workflow run it on Windows.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tool = join(root, "tools", "installer");
const arch = process.argv[2] ?? "x64";
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const setup = join(root, "dist", `Shelfed-${version}-win-${arch}-setup.exe`);
const unpacked = join(root, "dist", arch === "x64" ? "win-unpacked" : `win-${arch}-unpacked`);
const out = join(root, "dist", `Shelfed-${version}-win-${arch}.exe`);

if (!existsSync(setup)) throw new Error(`No ${setup}. Run electron-builder --win --${arch} first.`);

/** Bytes in a folder, all the way down: how much Shelfed takes once installed, for the progress bar. */
const bytes = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const path = join(dir, entry.name);
    return sum + (entry.isDirectory() ? bytes(path) : statSync(path).size);
  }, 0);
const size = existsSync(unpacked) ? bytes(unpacked) : 300_000_000;

const go = (args, env = {}) => execFileSync("go", args, { cwd: tool, stdio: "inherit", env: { ...process.env, ...env } });
const payload = join(tool, "payload", "setup.exe");
copyFileSync(setup, payload);
try {
  // Shelfed's icon, its name and version in the file's details, and sharp text at any display scale.
  go([
    "run", "github.com/tc-hib/go-winres@v0.3.3", "simply",
    "--icon", join(root, "build", "icon.png"),
    "--manifest", "gui",
    "--arch", "amd64",
    "--product-name", "Shelfed",
    "--file-description", "Shelfed installer",
    "--product-version", version,
    "--file-version", version,
    "--copyright", "Copyright © 2026 Šimon Vepřek",
    "--original-filename", `Shelfed-${version}-win-${arch}.exe`,
  ]);
  // One installer program for both: on ARM it runs as x64, and the Shelfed it installs is ARM's own.
  go(["build", "-trimpath", "-ldflags", `-s -w -H windowsgui -X main.version=${version} -X main.size=${size}`, "-o", out, "."], {
    GOOS: "windows",
    GOARCH: "amd64",
    CGO_ENABLED: "0",
  });
  console.log(`${out} (${(statSync(out).size / 1e6).toFixed(0)} MB, Shelfed ${(size / 1e6).toFixed(0)} MB installed)`);
} finally {
  rmSync(payload, { force: true });
  for (const name of readdirSync(tool)) if (name.endsWith(".syso")) rmSync(join(tool, name));
}
