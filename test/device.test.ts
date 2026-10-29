import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() }, safeStorage: { isEncryptionAvailable: () => false } }));
const { deviceFiles, removeFromDevice } = await import("../src/main/kindle");

let device: string;
beforeEach(async () => {
  device = await mkdtemp(join(tmpdir(), "shelf-kindle-"));
  await mkdir(join(device, "documents", "Dracula - Bram Stoker.sdr"), { recursive: true });
  await writeFile(join(device, "documents", "Dracula - Bram Stoker.azw3"), "a book");
  await writeFile(join(device, "documents", "Dracula - Bram Stoker.sdr", "notes.pds"), "notes");
  await writeFile(join(device, "documents", "My Clippings.txt"), "clippings");
  await writeFile(join(device, "outside.azw3"), "not in documents");
});
afterEach(() => rm(device, { recursive: true, force: true }));

describe("books on a Kindle plugged in as a drive", () => {
  it("are listed with their size and where they are", async () => {
    expect(await deviceFiles(device)).toContainEqual({ name: "Dracula - Bram Stoker.azw3", path: "Dracula - Bram Stoker.azw3", size: 6 });
  });

  it("go with their notes folder, and nothing outside documents or that isn't a book goes", async () => {
    const freed = await removeFromDevice(device, ["Dracula - Bram Stoker.azw3", "../outside.azw3", "My Clippings.txt", "/etc/hosts"]);
    expect(freed).toBe(6);
    expect(existsSync(join(device, "documents", "Dracula - Bram Stoker.azw3"))).toBe(false);
    expect(existsSync(join(device, "documents", "Dracula - Bram Stoker.sdr"))).toBe(false);
    expect(existsSync(join(device, "outside.azw3"))).toBe(true);
    expect(existsSync(join(device, "documents", "My Clippings.txt"))).toBe(true);
  });
});
