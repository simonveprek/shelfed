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
    ["About Shelfed", "Shelfed"],
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

test("an app icon can be chosen, and stays chosen", async ({ shelf }) => {
  await openSettings(shelf.page);
  await shelf.page.getByRole("dialog").getByRole("button", { name: "Appearance", exact: true }).click();
  const lux = shelf.page.getByRole("button", { name: "Lux" });
  await lux.click();
  await expect(lux).toHaveAttribute("aria-pressed", "true");
  await expect(shelf.page.getByRole("button", { name: "Paper" })).toHaveAttribute("aria-pressed", "false");
  await shelf.restart();
  await openSettings(shelf.page);
  await shelf.page.getByRole("dialog").getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(shelf.page.getByRole("button", { name: "Lux" })).toHaveAttribute("aria-pressed", "true");
});

test("makes Kindle, Word and FB2 files with nothing else installed", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  for (const [label, ext] of [["AZW3", "AZW3"], ["Word", "DOCX"], ["FB2", "FB2"]]) {
    await card(page, "Salt and Ink").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Convert" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText(label, { exact: true }).click();
    await dialog.getByRole("button", { name: `Make ${label}` }).click();
    await expect(page.getByText(`Salt and Ink is now ${ext} too`)).toBeVisible({ timeout: 20_000 });
  }
});

test.describe("a Kindle plugged in as a drive", () => {
  test.use({ kindle: "drive", onKindle: ["Salt and Ink - Ada Marsh.azw3", "Notes.txt"] });

  test("shows which books are already on it", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    // In the side panel, on the cover, in the book's details, and as a place of its own.
    await expect(page.locator("aside").getByText("1 of your books is on it", { exact: false })).toBeVisible();
    await expect(card(page, "Salt and Ink").getByText("Kindle", { exact: true })).toBeVisible();
    await expect(card(page, "A Winter Orchard").getByText("Kindle", { exact: true })).toHaveCount(0);
    // The sidebar names the place; selecting the book adds its badge. A book
    // not on it is picked first, as the last one imported starts selected.
    await card(page, "A Winter Orchard").click();
    await expect(page.getByText("On your Kindle", { exact: true })).toHaveCount(1);
    await card(page, "Salt and Ink").click();
    await expect(page.getByText("On your Kindle", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "On your Kindle", exact: true }).click();
    await expect(card(page, "Salt and Ink")).toBeVisible();
    await expect(card(page, "A Winter Orchard")).toHaveCount(0);
  });
});

test.describe("a Kindle that connects like a phone", () => {
  test.use({ kindle: "phone" });

  test("says plainly it can't take books by cable", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await expect(page.locator("aside").getByText("It connects like a phone", { exact: false })).toBeVisible();
    await card(page, "Salt and Ink").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Send to Kindle" }).click();
    await page.getByRole("dialog").getByText("By cable").click();
    await expect(page.getByText("This Kindle can't take books by cable")).toBeVisible();
    await expect(page.getByText("connects like a phone", { exact: false }).last()).toBeVisible();
  });
});
