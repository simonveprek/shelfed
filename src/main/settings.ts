import { app, safeStorage } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Settings } from "../shared/types";

const file = () => join(app.getPath("userData"), "settings.json");
const secretFile = () => join(app.getPath("userData"), "smtp.bin");

export function defaults(): Settings {
  return {
    libraryPath: process.env.SHELF_LIBRARY ?? join(app.getPath("documents"), "Shelf Library"),
    view: "grid",
    gridSize: 156,
    sort: "added",
    sortDir: "desc",
    inspector: true,
    sidebar: true,
    pdfPage: "A5",
    kindle: { to: "", from: "", host: "", port: 465, secure: true, user: "", hasPassword: false, format: "epub" },
    reader: { theme: "light", font: "publisher", size: 18, spacing: 1.5, width: 680, flow: "paginated", justify: true },
    bookcase: { group: "none", material: "paper", spines: "cover", fit: true, authors: true, ribbons: true, lean: true, ribbon: "accent" },
  };
}

let current: Settings | null = null;

export function getSettings(): Settings {
  if (current) return current;
  const base = defaults();
  try {
    if (existsSync(file())) {
      const saved = JSON.parse(readFileSync(file(), "utf8"));
      current = {
        ...base,
        ...saved,
        kindle: { ...base.kindle, ...saved.kindle },
        reader: { ...base.reader, ...saved.reader },
        bookcase: { ...base.bookcase, ...saved.bookcase },
      };
    }
  } catch {
    // A broken file falls back to the defaults rather than stopping the app.
  }
  current ??= base;
  current.kindle.hasPassword = existsSync(secretFile());
  return current;
}

let writing = Promise.resolve();

export function setSettings(patch: Partial<Settings>): Settings {
  const prev = getSettings();
  current = {
    ...prev,
    ...patch,
    kindle: { ...prev.kindle, ...patch.kindle },
    reader: { ...prev.reader, ...patch.reader },
    bookcase: { ...prev.bookcase, ...patch.bookcase },
  };
  const data = JSON.stringify(current, null, 2);
  // Writes queue up and land whole, so a crash never leaves half a file.
  writing = writing
    .then(async () => {
      await writeFile(file() + ".tmp", data);
      await rename(file() + ".tmp", file());
    })
    // One failed write must not stop every write after it.
    .catch((error) => console.error("Could not save settings", error));
  return current;
}

export async function setSmtpPassword(password: string) {
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(password) : Buffer.from(password, "utf8");
  await writeFile(secretFile(), data);
  setSettings({ kindle: { ...getSettings().kindle, hasPassword: true } });
}

export function getSmtpPassword(): string {
  if (!existsSync(secretFile())) return "";
  const data = readFileSync(secretFile());
  try {
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString("utf8");
  } catch {
    return "";
  }
}
