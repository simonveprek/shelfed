import type { Page } from "@playwright/test";
import { card, expect, openSettings, test } from "./shelf";

/*
 * A CrossPoint reader on Wi-Fi: a pretend one answering as the real one's web
 * server does while its File Transfer screen is open, at the address given in
 * Settings. The network itself is never asked.
 */

test.skip(Boolean(process.env.SHELF_APP), "An installed app is never pointed at a pretend reader");

/** The side panel with nothing selected, where the e-reader waits. */
async function dock(page: Page) {
  const panel = page.locator("aside.w-\\[340px\\]");
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(panel.getByText("Your e-reader", { exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  return panel;
}

test.describe("a CrossPoint reader on Wi-Fi", () => {
  test.use({ wifiReader: { "/Books/Salt and Ink - Ada Marsh.epub": "a book", "/sleep.bmp": "a picture", "/.crosspoint/wifi.json": "{}" } });

  test("is found, shown as itself with no cable, and knows which books are on it", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    const aside = await dock(page);
    await expect(aside.getByText("Xteink X4", { exact: true })).toBeVisible();
    await expect(aside.getByText("On Wi-Fi.", { exact: false })).toBeVisible();
    await expect(aside.getByText("1 of your books is on it", { exact: false })).toBeVisible();
    await expect(aside.locator('[data-model="xteink"]')).toBeVisible();
    await expect(card(page, "Salt and Ink").getByText("CrossPoint", { exact: true })).toBeVisible();
  });

  test("takes a book into its Books folder, as an EPUB", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await dock(page);
    await card(page, "A Winter Orchard").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy to CrossPoint" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("On Wi-Fi", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Copy to CrossPoint" }).click();
    await expect
      .poll(() => [...shelf.crosspoint!.card.keys()].filter((path) => path.includes("A Winter Orchard")), { timeout: 30_000 })
      .toEqual([expect.stringMatching(/^\/Books\/.*\.epub$/)]);
    await expect(card(page, "A Winter Orchard").getByText("CrossPoint", { exact: true })).toBeVisible({ timeout: 20_000 });
    // Its own files were never asked for.
    expect(shelf.crosspoint!.asked.join("\n")).not.toContain(".crosspoint");
  });

  test("is forgotten once looking for it is turned off", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await dock(page);
    await openSettings(page);
    const settings = page.getByRole("dialog");
    await settings.getByRole("button", { name: "Kindle", exact: true }).click();
    await expect(settings.getByText("Found", { exact: true })).toBeVisible();
    await settings.getByRole("switch", { name: "Look for CrossPoint readers" }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("aside.w-\\[340px\\]").getByText("Xteink X4", { exact: true })).toHaveCount(0, { timeout: 15_000 });
  });
});
