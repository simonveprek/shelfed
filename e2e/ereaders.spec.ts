import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { card, expect, openSettings, test, type Shelf } from "./shelf";

/*
 * E-readers besides Kindles: a pretend Kobo or PocketBook, a folder with the
 * folders the real ones keep, plugged in from the start.
 */

test.skip(Boolean(process.env.SHELF_APP), "An installed app never pretends an e-reader is plugged in");

/** Hands Shelfed a book the way the system does, from Finder or Explorer, which opens it; then goes back to the library. */
async function hand(shelf: Shelf, files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "shelf-hand-"));
  const paths = Object.entries(files).map(([name, text]) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  });
  await shelf.app.evaluate(({ BrowserWindow }, list) => BrowserWindow.getAllWindows()[0].webContents.send("open-files", list), paths);
  await expect(shelf.page.getByRole("button", { name: "Next page" })).toBeVisible();
  await shelf.page.getByRole("button", { name: "Back to the library" }).click();
}

const FB2 = `<?xml version="1.0" encoding="UTF-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><author><first-name>Leo</first-name><last-name>Tolstoy</last-name></author><book-title>Anna Karenina</book-title><lang>en</lang></title-info></description><body><section><p>Happy families are all alike; every unhappy family is unhappy in its own way.</p></section></body></FictionBook>`;

/** The side panel with nothing selected, where the e-reader waits. */
async function dock(page: Page, heading = "Your e-reader") {
  const panel = page.locator("aside.w-\\[340px\\]");
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(panel.getByText(heading, { exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass();
  return panel;
}

test.describe("a Kobo plugged in", () => {
  test.use({ kindle: "kobo", onKindle: ["Salt and Ink - Ada Marsh.epub", "Notes.txt"] });

  test("is a Kobo everywhere a Kindle would be, and shows what's on it", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    const aside = await dock(page);
    await expect(aside.locator("p", { hasText: /^Kobo$/ })).toBeVisible();
    await expect(aside.getByText("1 of your books is on it", { exact: false })).toBeVisible();
    await expect(card(page, "Salt and Ink").getByText("Kobo", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "On your Kobo", exact: true }).click();
    await expect(card(page, "Salt and Ink")).toBeVisible();
    await expect(card(page, "A Winter Orchard")).toHaveCount(0);
    await expect(page.getByText("Kindle", { exact: true })).toHaveCount(0);
  });

  test("looks like a Kobo, not a Kindle, wherever it's shown", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    const aside = await dock(page);
    await expect(aside.locator('[data-model="kobo"]')).toBeVisible();
    await card(page, "A Winter Orchard").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy to Kobo" }).click();
    await expect(page.getByRole("dialog").locator('[data-model="kobo"]')).toBeVisible();
    await page.keyboard.press("Escape");
    // And when it arrives, the whole window greets a Kobo.
    await openSettings(page);
    await page.getByRole("dialog").getByRole("button", { name: "Kindle", exact: true }).click();
    await page.getByRole("button", { name: "Play the plug-in animation" }).click();
    await expect(page.locator('.fixed.inset-0 [data-model="kobo"]')).toBeVisible();
    await expect(page.getByText("Kobo", { exact: true }).last()).toBeVisible();
  });

  test("takes a book as the EPUB it is, at the top of the drive", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await card(page, "A Winter Orchard").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy to Kobo" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Copy to Kobo" })).toBeVisible();
    await expect(dialog.getByText("Copies the books as they are.", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Copy to Kobo" }).click();
    await expect(page.getByText("On your Kobo", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => readdirSync(shelf.kindle).filter((name) => name.includes("A Winter Orchard"))).toEqual([expect.stringMatching(/\.epub$/)]);
    await expect(card(page, "A Winter Orchard").getByText("Kobo", { exact: true })).toBeVisible();
  });

  test("makes an EPUB first for a book that hasn't one, and copies that", async ({ shelf }) => {
    const { page } = shelf;
    await hand(shelf, { "The Salt Road.txt": "The road ran down to the sea, white with salt.\n\nNobody walked it after dark." });
    await expect(card(page, "The Salt Road")).toBeVisible();
    await card(page, "The Salt Road").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy to Kobo" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Books it can't read as they are get an EPUB made first.", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Copy to Kobo" }).click();
    await expect.poll(() => readdirSync(shelf.kindle).filter((name) => name.includes("The Salt Road")), { timeout: 30_000 }).toEqual([expect.stringMatching(/\.epub$/)]);
    // The EPUB stays in the library too, beside the text.
    await card(page, "The Salt Road").click();
    await expect(page.locator("aside.w-\\[340px\\]").getByText("EPUB", { exact: true }).first()).toBeVisible();
  });

  test("takes a book dropped on it in the side panel", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    const aside = await dock(page);
    // A book dragged from the library carries its id, the way the library's own drag does.
    const id = await page.evaluate(async () => ((await window.shelf.call("boot")) as { books: Array<{ id: string; title: string }> }).books.find((b) => b.title === "A Winter Orchard")!.id);
    const carried = await page.evaluateHandle((id) => {
      const data = new DataTransfer();
      data.setData("application/x-shelf-books", JSON.stringify([id]));
      return data;
    }, id);
    const device = aside.locator('[data-model="kobo"]');
    await device.dispatchEvent("dragenter", { dataTransfer: carried });
    await device.dispatchEvent("dragover", { dataTransfer: carried });
    await expect(aside.getByText("Let go to copy it on")).toBeVisible();
    await device.dispatchEvent("drop", { dataTransfer: carried });
    await expect.poll(() => readdirSync(shelf.kindle).some((name) => name.includes("A Winter Orchard")), { timeout: 30_000 }).toBe(true);
    await expect(aside.getByText("2 of your books are on it", { exact: false })).toBeVisible();
  });

  test("brings over its books, and takes finished ones off after asking", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await (await dock(page)).getByRole("button", { name: "1 book on it isn't in Shelfed. Bring it over" }).click();
    await expect(page.getByText("Added 1 book from your e-reader")).toBeVisible();
    await expect(card(page, "Notes")).toBeVisible();
    await card(page, "Salt and Ink").click({ button: "right" });
    await page.getByRole("menuitemradio", { name: "Mark as finished" }).click();
    // The book's own button says where it goes.
    await expect(page.locator("aside.w-\\[340px\\]").getByRole("button", { name: "Kobo", exact: true })).toBeVisible();
    await (await dock(page)).getByRole("button", { name: /finished book on it/ }).click();
    const ask = page.getByRole("alertdialog");
    await expect(ask.getByText("Take 1 finished book off your Kobo?")).toBeVisible();
    await expect(ask.getByText("An e-reader has no Trash", { exact: false })).toBeVisible();
    await ask.getByRole("button", { name: "Take them off" }).click();
    await expect(page.getByText("Took 1 finished book off your Kobo")).toBeVisible();
    await expect.poll(() => readdirSync(shelf.kindle).includes("Salt and Ink - Ada Marsh.epub")).toBe(false);
    await expect(card(page, "Salt and Ink")).toBeVisible();
  });

  test("its own files are out of the page's reach, whatever the page asks", async ({ shelf }) => {
    const { page } = shelf;
    mkdirSync(join(shelf.kindle, ".kobo"), { recursive: true });
    writeFileSync(join(shelf.kindle, ".kobo", "KoboReader.sqlite"), "its database");
    writeFileSync(join(shelf.kindle, "..", "outside.epub"), "not on it");
    await shelf.add();
    await dock(page);
    const results = await page.evaluate(async (drive) => {
      const tryIt = (method: string, ...args: unknown[]) => window.shelf.call(method, ...args).then((value) => ({ value }), (error: Error) => ({ error: error.message }));
      return {
        database: await tryIt("filesFromDevice", drive, [".kobo/KoboReader.sqlite"]),
        climbing: await tryIt("filesFromDevice", drive, ["../outside.epub"]),
        removed: await tryIt("removeFromDevice", drive, [".kobo/KoboReader.sqlite", "../outside.epub", "/etc/hosts"]),
        elsewhere: await tryIt("deviceFiles", drive.replace(/[\\/]Kindle$/, "")),
      };
    }, shelf.kindle);
    expect(results.database).toEqual({ error: "That file isn't on your e-reader." });
    expect(results.climbing).toEqual({ error: "That file isn't on your e-reader." });
    expect(results.removed).toEqual({ value: 0 });
    expect(results.elsewhere).toEqual({ error: "That e-reader isn't plugged in any more." });
    expect(existsSync(join(shelf.kindle, ".kobo", "KoboReader.sqlite"))).toBe(true);
    expect(existsSync(join(shelf.kindle, "..", "outside.epub"))).toBe(true);
  });
});

test.describe("a Kobo, in Czech", () => {
  test.use({ kindle: "kobo", onKindle: ["Salt and Ink - Ada Marsh.epub"], language: "cs" });

  test("is a čtečka everywhere, and copies in Czech", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await dock(page, "Vaše čtečka");
    await expect(page.getByRole("button", { name: "Ve vaší čtečce", exact: true })).toBeVisible();
    await card(page, "A Winter Orchard").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Zkopírovat do čtečky" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Zkopíruje knihy tak, jak jsou.", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Zkopírovat do čtečky" }).click();
    await expect(page.getByText("Ve vaší čtečce", { exact: true }).last()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => readdirSync(shelf.kindle).some((name) => name.includes("A Winter Orchard"))).toBe(true);
  });
});

test.describe("a PocketBook plugged in", () => {
  test.use({ kindle: "pocketbook", onKindle: ["Salt and Ink - Ada Marsh.epub"] });

  test("is known by name and look, and its system folder isn't taken for books", async ({ shelf }) => {
    const { page } = shelf;
    mkdirSync(join(shelf.kindle, "system", "config"), { recursive: true });
    writeFileSync(join(shelf.kindle, "system", "A Winter Orchard - Tomas Reed.epub"), "a file of its own");
    await shelf.add();
    const aside = await dock(page);
    await expect(aside.locator("p", { hasText: /^PocketBook$/ })).toBeVisible();
    await expect(aside.locator('[data-model="pocketbook"]')).toBeVisible();
    // Only Salt and Ink counts: the one in its system folder isn't a book on it.
    await expect(aside.getByText("1 of your books is on it", { exact: false })).toBeVisible();
    await expect(card(page, "A Winter Orchard").getByText("PocketBook", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "On your PocketBook", exact: true })).toBeVisible();
  });

  test("takes an FB2 as it is, since it reads FB2", async ({ shelf }) => {
    const { page } = shelf;
    await hand(shelf, { "Anna Karenina - Leo Tolstoy.fb2": FB2 });
    await expect(card(page, "Anna Karenina")).toBeVisible();
    await card(page, "Anna Karenina").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy to PocketBook" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Copies the books as they are.", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Copy to PocketBook" }).click();
    await expect.poll(() => readdirSync(shelf.kindle).filter((name) => name.includes("Anna Karenina")), { timeout: 30_000 }).toEqual([expect.stringMatching(/\.fb2$/)]);
  });
});
