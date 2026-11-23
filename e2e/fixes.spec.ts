import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { epubToAzw3 } from "../src/main/azw3";
import { card, epub, expect, test, type Shelf } from "./shelf";

/*
 * What people reported about 0.2.0: menus cut off by the panel they open in,
 * Kindle books with DRM converted into nonsense, and characters XML forbids
 * left in a made EPUB.
 */

/**
 * Whether a menu item is what's on top at its middle, as a person would see it. Asked before any click,
 * since Playwright scrolls a clipping panel to reach an item, which a person can't.
 */
const onTop = (item: ReturnType<Shelf["page"]["getByRole"]>) =>
  item.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  });

/** The panel's More button, once the panel has settled: a new book's panel comes in as the last one fades out. */
async function openMore(page: Shelf["page"]) {
  const more = page.getByRole("button", { name: "More", exact: true });
  await expect(more).toHaveCount(1);
  await more.click();
}

test.describe("menus in the book panel", () => {
  test("the More menu shows in full, and what's at its bottom can be clicked", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await card(page, "Salt and Ink").click();
    await openMore(page);
    for (const name of ["Find details online", "Edit details", "Remove from library"]) expect(await onTop(page.getByRole("menuitem", { name })), name).toBe(true);
    await page.getByRole("menuitem", { name: "Edit details" }).click({ timeout: 5000 });
    await expect(page.getByRole("dialog", { name: "Edit details" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Edit details" })).toHaveCount(0);
    await openMore(page);
    await page.getByRole("menuitem", { name: "Remove from library" }).click({ timeout: 5000 });
  });

  test("with several books chosen, Mark and Collection open in full too", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await card(page, "Salt and Ink").click();
    await card(page, "A Winter Orchard").click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
    await page.getByRole("button", { name: "Mark", exact: true }).click();
    expect(await onTop(page.getByRole("menuitem", { name: "Finished" }))).toBe(true);
    await page.getByRole("menuitem", { name: "Finished" }).click({ timeout: 5000 });
    await expect
      .poll(() => page.evaluate(async () => ((await window.shelf.call("boot")) as { books: Array<{ status: string }> }).books.filter((b) => b.status === "finished").length))
      .toBe(2);
    await page.getByRole("button", { name: "Collection", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "New collection" })).toBeVisible();
    expect(await onTop(page.getByRole("menuitem", { name: "New collection" }))).toBe(true);
    await page.getByRole("menuitem", { name: "New collection" }).click({ timeout: 5000 });
  });
});

/** A Kindle book as Amazon sells it: a real AZW3 whose first record says it's encrypted. */
async function lockedAzw3() {
  const dir = mkdtempSync(join(tmpdir(), "shelf-drm-"));
  const source = join(dir, "in.epub");
  writeFileSync(source, epub({ title: "Leaders Eat Last", author: "Simon Sinek" }));
  const data = Buffer.from(await epubToAzw3(resolve(import.meta.dirname, "../resources/azw3.wasm"), source, "Leaders Eat Last", "Simon Sinek"));
  // The PalmDOC header opens the first record; its seventh field, two bytes in at 12, is the encryption. 2 is Amazon's.
  data.writeUInt16BE(2, data.readUInt32BE(78) + 12);
  const path = join(dir, "Leaders Eat Last.azw3");
  writeFileSync(path, data);
  return path;
}

async function hand(shelf: Shelf, path: string) {
  await shelf.app.evaluate(({ BrowserWindow }, file) => BrowserWindow.getAllWindows()[0].webContents.send("open-files", [file]), path);
}

const lockedOf = (shelf: Shelf) =>
  shelf.page.evaluate(async () => ((await window.shelf.call("boot")) as { books: Array<{ title: string; locked?: string[] }> }).books.find((b) => b.title === "Leaders Eat Last")?.locked ?? null);

test.describe("a Kindle book with DRM", () => {
  test("comes in, but opens to a note that it's locked instead of scrambled text, and isn't offered for converting", async ({ shelf }) => {
    const { page } = shelf;
    await hand(shelf, await lockedAzw3());
    // A single book handed over opens: here, to say why it can't.
    await expect(page.getByText("locked with DRM to the Kindle it was bought for", { exact: false })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Back to the library" }).click();
    await expect(card(page, "Leaders Eat Last")).toBeVisible();
    expect(await lockedOf(shelf)).toEqual(["azw3"]);
    await card(page, "Leaders Eat Last").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Convert" }).click();
    const convert = page.getByRole("dialog", { name: "Convert" });
    await expect(convert.getByRole("radio", { name: /EPUB/ })).toBeDisabled();
    await expect(convert.getByRole("button", { name: /^Make/ })).toBeDisabled();
  });

  test("added before Shelfed looked, it says it's locked when converted, and is remembered as locked", async ({ shelf }) => {
    const { page } = shelf;
    await hand(shelf, await lockedAzw3());
    await page.getByRole("button", { name: "Back to the library" }).click({ timeout: 20_000 });
    // As a book added by 0.2.0 would be: nothing known about its lock.
    await page.evaluate(async () => {
      const { books } = (await window.shelf.call("boot")) as { books: Array<{ id: string; title: string }> };
      await window.shelf.call("update", books.find((b) => b.title === "Leaders Eat Last")!.id, { locked: [] });
    });
    await page.reload();
    await card(page, "Leaders Eat Last").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Convert" }).click();
    const convert = page.getByRole("dialog", { name: "Convert" });
    await convert.getByText("EPUB", { exact: true }).click();
    await convert.getByRole("button", { name: /^Make/ }).click();
    await expect(page.getByText("locked with DRM to the Kindle it was bought for", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => lockedOf(shelf)).toEqual(["azw3"]);
    const epubs = await page.evaluate(async () => ((await window.shelf.call("boot")) as { books: Array<{ title: string; formats: Array<{ ext: string }> }> }).books.find((b) => b.title === "Leaders Eat Last")!.formats.map((f) => f.ext));
    expect(epubs).toEqual(["azw3"]);
  });
});

test("an EPUB made from a book holds none of the characters XML forbids", async ({ shelf }) => {
  const { page } = shelf;
  const dir = mkdtempSync(join(tmpdir(), "shelf-xml-"));
  const path = join(dir, "Control.txt");
  writeFileSync(path, "Prologue\n\nThe Bite of the Raptor. \u0001 First Iteration \u0002 and on.\n");
  await hand(shelf, path);
  await page.getByRole("button", { name: "Back to the library" }).click({ timeout: 20_000 });
  await card(page, "Control").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Convert" }).click();
  const convert = page.getByRole("dialog", { name: "Convert" });
  await convert.getByText("EPUB", { exact: true }).click();
  await convert.getByRole("button", { name: /^Make/ }).click();
  await expect(page.getByText("Control is now EPUB too")).toBeVisible({ timeout: 30_000 });
  const bytes = await page.evaluate(async () => {
    const { books } = (await window.shelf.call("boot")) as { books: Array<{ id: string; title: string }> };
    return [...new Uint8Array(await (await fetch(`shelf://file/${books.find((b) => b.title === "Control")!.id}/epub`)).arrayBuffer())];
  });
  const files = unzipSync(new Uint8Array(bytes));
  const text = Object.entries(files).filter(([name]) => /\.(xhtml|opf|ncx|xml)$/.test(name)).map(([, data]) => strFromU8(data)).join("\n");
  expect(text).toContain("The Bite of the Raptor.");
  expect(text).toContain("First Iteration");
  expect(text).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
});
