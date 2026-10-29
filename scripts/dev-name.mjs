// While developing, Shelfed runs inside Electron's own app, and macOS names it
// in the Dock and the menu bar from that app's Info.plist: "Electron". This
// renames the development copy to Shelfed. It runs after npm install, and does
// nothing anywhere else: built apps are named Shelfed by electron-builder.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const app = join(import.meta.dirname, "../node_modules/electron/dist/Electron.app");
if (process.platform !== "darwin" || !existsSync(app)) process.exit(0);

const plist = join(app, "Contents/Info.plist");
const read = (key) => execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist]).toString().trim();
const strings = join(app, "Contents/Resources/en.lproj/InfoPlist.strings");
if (read("CFBundleName") === "Shelfed" && existsSync(strings)) process.exit(0);

for (const key of ["CFBundleName", "CFBundleDisplayName"]) execFileSync("plutil", ["-replace", key, "-string", "Shelfed", plist]);
// The Dock goes by the app's folder name, Electron.app, unless it has a display
// name in its own language. Renaming the folder would break the path to it.
execFileSync("plutil", ["-replace", "LSHasLocalizedDisplayName", "-bool", "true", plist]);
mkdirSync(dirname(strings), { recursive: true });
writeFileSync(strings, 'CFBundleName = "Shelfed";\nCFBundleDisplayName = "Shelfed";\n');
// Editing the Info.plist breaks Electron's signature, so the copy is signed again, for this Mac only.
execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
// And macOS is told to forget the old name it remembered.
execFileSync("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", app], { stdio: "ignore" });
console.log("Named the development app Shelfed.");
