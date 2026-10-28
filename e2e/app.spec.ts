import { BOOKS, card, expect, openSettings, test } from "./shelf";

const broken = (page: import("@playwright/test").Page) => expect(page.getByText("Something went wrong")).toHaveCount(0);

test("starts on an empty library", async ({ shelf }) => {
  await expect(shelf.page.getByText("A home for your books")).toBeVisible();
});

test("adds books handed over by the system", async ({ shelf }) => {
  await shelf.add();
  await expect(shelf.page.getByText(`Added ${BOOKS.length} books`)).toBeVisible();
  for (const book of BOOKS) await expect(card(shelf.page, book.title)).toContainText(book.author);
});

test("a book's right-click menu opens, and the window stays", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  await card(page, "Salt and Ink").click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Read" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Remove from library" })).toBeVisible();
  await broken(page);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("every view shows the books", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  for (const view of ["List", "Shelves", "Bookcase in 3D", "Covers"]) {
    await page.getByRole("radio", { name: view }).click();
    await expect(page.getByRole("radio", { name: view })).toHaveAttribute("aria-checked", "true");
    await broken(page);
    if (view !== "Bookcase in 3D") await expect(page.locator("main").getByText("A Winter Orchard").first()).toBeVisible();
  }
});

test("the sidebar goes to each place", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  for (const place of ["Reading", "Want to read", "Finished", "Favorites", "Recently added", "Authors", "Series", "Tags", "Formats", "All books"]) {
    await page.getByRole("button", { name: place, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(place);
    await broken(page);
  }
  // Authors groups the two books by Ada Marsh.
  await page.getByRole("button", { name: "Authors", exact: true }).click();
  await expect(page.locator("main").getByText("Ada Marsh").first()).toBeVisible();
});

test("search finds a book by its title", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  await page.getByPlaceholder("Search your books").fill("orchard");
  await expect(card(page, "A Winter Orchard")).toBeVisible();
  await expect(card(page, "Salt and Ink")).toHaveCount(0);
  await page.getByPlaceholder("Search your books").fill("nothing like this");
  await expect(page.getByText("Nothing found")).toBeVisible();
});

test("opens a book, turns a page and comes back", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  await card(page, "The Lighthouse Keeper").dblclick();
  const next = page.getByRole("button", { name: "Next page" });
  await expect(next).toBeVisible();
  await next.click();
  await broken(page);
  await page.keyboard.press("Escape");
  await expect(next).toHaveCount(0);
  // Opening it put it in Reading.
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(card(page, "The Lighthouse Keeper")).toBeVisible();
});

test("removing a book can be undone", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  await card(page, "Salt and Ink").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from library" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(card(page, "Salt and Ink")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "Salt and Ink")).toBeVisible();
});

test("settings opens every section", async ({ shelf }) => {
  const { page } = shelf;
  await openSettings(page);
  const dialog = page.getByRole("dialog");
  // Each section, by its button and the heading it opens on.
  const sections = [
    ["Library", "Library"],
    ["Appearance", "Appearance"],
    ["Reading", "Reading"],
    ["Kindle", "Kindle"],
    ["Sending", "Sending by email"],
    ["Converting", "Converting"],
    ["About Shelf", "Shelf"],
  ];
  for (const [section, heading] of sections) {
    await dialog.getByRole("button", { name: section, exact: true }).click();
    await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await broken(page);
  }
  await expect(dialog.getByRole("button", { name: "Check for updates" })).toBeVisible();
});

test("the Kindle's plug-in animation plays from settings", async ({ shelf }) => {
  const { page } = shelf;
  await openSettings(page);
  await page.getByRole("dialog").getByRole("button", { name: "Kindle", exact: true }).click();
  await page.getByRole("button", { name: "Play the plug-in animation" }).click();
  await expect(page.getByText("Plugged in", { exact: true })).toBeVisible();
  await expect(page.getByText("Plugged in", { exact: true })).toHaveCount(0, { timeout: 8000 });
});

test("the library is still there after a restart", async ({ shelf }) => {
  await shelf.add();
  await shelf.restart();
  for (const book of BOOKS) await expect(card(shelf.page, book.title)).toBeVisible();
});
