/*
 * Builds the helper Shelfed uses to reach newer Kindles on Windows, from
 * tools/kindle-wpd, to resources/kindle-wpd.exe. Needs Go. Works from any
 * system, and the release and CI run it before packaging for Windows. Built as
 * a windowed program, so no console can ever flash on someone's screen.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
mkdirSync(join(root, "resources"), { recursive: true });
execFileSync("go", ["build", "-trimpath", "-ldflags=-s -w -H=windowsgui", "-o", join(root, "resources", "kindle-wpd.exe"), "."], {
  cwd: join(root, "tools", "kindle-wpd"),
  stdio: "inherit",
  env: { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" },
});
