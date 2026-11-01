/*
 * Looks inside every packed app in dist, without starting it, and fails if it
 * doesn't hold the app, or its lockdown isn't on.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import asar from "@electron/asar";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const problems = [];
const need = (ok, what) => void (ok || problems.push(what));

function check(archive, app, label) {
  need(asar.listPackage(archive).some((entry) => entry.replaceAll("\\", "/").includes("/out/main/index.js")), `${label}: no app in its archive`);
  const out = execFileSync(process.execPath, [join(root, "node_modules/@electron/fuses/dist/bin.js"), "read", "--app", app], { encoding: "utf8" });
  for (const fuse of ["RunAsNode", "EnableNodeOptionsEnvironmentVariable", "EnableNodeCliInspectArguments"]) need(new RegExp(`${fuse} is Disabled`).test(out), `${label}: ${fuse} isn't off`);
  for (const fuse of ["OnlyLoadAppFromAsar", "EnableEmbeddedAsarIntegrityValidation"]) need(new RegExp(`${fuse} is Enabled`).test(out), `${label}: ${fuse} isn't on`);
}

let found = 0;
for (const name of readdirSync(dist)) {
  const dir = join(dist, name);
  if (name === "win-unpacked") {
    found++;
    check(join(dir, "resources", "app.asar"), join(dir, "Shelfed.exe"), dir);
  } else if (/^mac(-arm64|-x64)?$/.test(name)) {
    found++;
    const app = join(dir, "Shelfed.app");
    check(join(app, "Contents", "Resources", "app.asar"), app, dir);
  }
}
need(found > 0, "No packed apps to check");
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${found} packed app(s) hold what they should, with their lockdown on`);
