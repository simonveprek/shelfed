import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { card, expect, openSettings, test } from "./shelf";

/*
 * A tour of every screen, saved as pictures, to look over how Shelfed comes
 * out on another system: run on GitHub's Windows machine by the Screens
 * workflow. Only runs when SHELF_SCREENS is set.
 */
test.skip(!process.env.SHELF_SCREENS, "Pictures only when asked for, with SHELF_SCREENS=1");
test.setTimeout(240_000);

const dir = resolve(import.meta.dirname, "../screens", process.platform);
mkdirSync(dir, { recursive: true });

/** The page, and on Windows the whole window as the system draws it, title bar buttons and all. */
async function shot(app: ElectronApplication, page: Page, name: string) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(dir, `${name}.png`) });
  if (process.platform !== "win32") return;
  const box = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const file = join(dir, `${name}-window.png`).replace(/'/g, "''");
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Add-Type -AssemblyName System.Drawing; $b = New-Object System.Drawing.Bitmap ${box.width}, ${box.height}; $g = [System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen(${box.x}, ${box.y}, 0, 0, $b.Size); $b.Save('${file}'); $g.Dispose(); $b.Dispose()`,
  ]);
}

async function theme(page: Page, value: "dark" | "light") {
  await page.evaluate((v) => localStorage.setItem("theme", v), value);
  await page.reload();
  await expect(page.getByRole("button", { name: "All books" })).toBeVisible();
  await page.waitForTimeout(500);
}

for (const mode of ["dark", "light"] as const) {
  test(`every screen, ${mode}`, async ({ shelf }) => {
    const { app } = shelf;
    let page = shelf.page;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
    await theme(page, mode);
    const at = (name: string) => shot(app, page, `${mode}-${name}`);

    await at("01-empty");
    await shelf.add();
    page = shelf.page;
    await at("02-covers");

    await card(page, "Salt and Ink").click();
    await at("03-book-selected");
    await card(page, "Salt and Ink").click({ button: "right" });
    await at("04-right-click");
    await page.keyboard.press("Escape");

    for (const [view, name] of [["List", "05-list"], ["Shelves", "06-shelves"], ["Bookcase in 3D", "07-bookcase"]]) {
      await page.getByRole("radio", { name: view }).click();
      await page.waitForTimeout(900);
      await at(name);
    }
    await page.getByLabel("Bookcase", { exact: true }).click();
    await at("08-bookcase-options");
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: "Covers" }).click();

    await card(page, "The Lighthouse Keeper").dblclick();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    await page.waitForTimeout(1200);
    await at("09-reader");
    await page.keyboard.press("Escape");

    await card(page, "A Winter Orchard").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Convert" }).click();
    await at("10-convert");
    await page.keyboard.press("Escape");
    await card(page, "A Winter Orchard").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Send to Kindle" }).click();
    await at("11-send");
    await page.keyboard.press("Escape");

    await openSettings(page);
    const dialog = page.getByRole("dialog");
    for (const [section, name] of [
      ["Library", "12-settings-library"],
      ["Appearance", "13-settings-appearance"],
      ["Reading", "14-settings-reading"],
      ["Kindle", "15-settings-kindle"],
      ["Sending", "16-settings-sending"],
      ["Converting", "17-settings-converting"],
      ["About Shelfed", "18-settings-about"],
    ]) {
      await dialog.getByRole("button", { name: section, exact: true }).click();
      await at(name);
    }
    await dialog.getByRole("button", { name: "Kindle", exact: true }).click();
    await page.getByRole("button", { name: "Play the plug-in animation" }).click();
    await page.waitForTimeout(1600);
    await at("19-kindle-arrives");
    await page.waitForTimeout(3500);

    await page.getByRole("button", { name: "Classics", exact: true }).click();
    await page.waitForTimeout(1500);
    await at("20-classics");
  });
}

test("the welcome", async ({ shelf }) => {
  const { app } = shelf;
  await theme(shelf.page, "dark");
  await openSettings(shelf.page);
  await shelf.page.getByRole("button", { name: "Show it again" }).click();
  await shelf.page.waitForTimeout(2500);
  await shot(app, shelf.page, "dark-21-welcome");
});
