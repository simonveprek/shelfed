import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { BOOKS, card, epub, expect, openSettings, test } from "./shelf";

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

test("books picked by hand join into one, with both books' files", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  await card(page, "Salt and Ink").click();
  await card(page, "A Winter Orchard").click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await card(page, "A Winter Orchard").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Join into one book" }).click();
  await expect(page.getByText("Joined into one book")).toBeVisible();
  await expect(page.locator("main [draggable=true]")).toHaveCount(BOOKS.length - 1);
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
  test.skip(Boolean(process.env.SHELF_APP), "An installed app never pretends a Kindle is plugged in");
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
    // The side panel counts the books on this shelf, not the whole library.
    await page.keyboard.press("Escape");
    await expect(page.locator("aside").getByText("1 author", { exact: true })).toBeVisible();
  });

  test("brings over the books on it that aren't in the library", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await page.keyboard.press("Escape");
    const offer = page.locator("aside").getByRole("button", { name: "1 book on it isn't in Shelfed. Bring it over" });
    await offer.click();
    await expect(page.getByText("Added 1 book from your Kindle")).toBeVisible();
    await expect(card(page, "Notes")).toBeVisible();
    // Brought over, it counts as on the Kindle, and isn't offered again.
    await expect(offer).toHaveCount(0);
    await expect(page.locator("aside").getByText("2 of your books are on it", { exact: false })).toBeVisible();
  });

  test("takes finished books off it, after asking, and keeps them in the library", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await card(page, "Salt and Ink").click({ button: "right" });
    await page.getByRole("menuitemradio", { name: "Mark as finished" }).click();
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Kindle", exact: true }).click();
    await expect(dialog.getByText("1 book you've finished is still on it", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Take them off" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Take them off" }).click();
    await expect(page.getByText("Took 1 finished book off your Kindle")).toBeVisible();
    await expect(dialog.getByText("you've finished", { exact: false })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(card(page, "Salt and Ink").getByText("Kindle", { exact: true })).toHaveCount(0);
    await expect(card(page, "Salt and Ink")).toBeVisible();
  });
});

test.describe("a Kindle that connects like a phone", () => {
  test.skip(Boolean(process.env.SHELF_APP), "An installed app never pretends a Kindle is plugged in");
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

test.describe("a Calibre library", () => {
  /** Calibre's way: Author/Title (id)/ with each format, a cover and metadata.opf, which knows better than the files. */
  function calibreLibrary() {
    const root = mkdtempSync(join(tmpdir(), "shelf-calibre-"));
    const dir = join(root, "John Flanagan", "The Ruins of Gorlan (12)");
    mkdirSync(dir, { recursive: true });
    const epubFile = join(dir, "The Ruins of Gorlan - John Flanagan.epub");
    const fb2File = join(dir, "The Ruins of Gorlan - John Flanagan.fb2");
    // The files themselves say little: a short title, and no author anyone wants.
    writeFileSync(epubFile, epub({ title: "Gorlan", author: "Unknown" }));
    writeFileSync(
      fb2File,
      `<?xml version="1.0" encoding="UTF-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><author><first-name>Unknown</first-name></author><book-title>Gorlan (FB2)</book-title><lang>en</lang></title-info></description><body><section><p>The tide came in slowly over the flats.</p></section></body></FictionBook>`,
    );
    writeFileSync(
      join(dir, "metadata.opf"),
      `<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>The Ruins of Gorlan</dc:title><dc:creator opf:role="aut" opf:file-as="Flanagan, John">John Flanagan</dc:creator>
<meta name="calibre:series" content="Ranger's Apprentice"/><meta name="calibre:series_index" content="1.0"/></metadata></package>`,
    );
    writeFileSync(join(root, "metadata.db"), "");
    return { root, epubFile, fb2File };
  }

  const hand = (shelf: { app: import("@playwright/test").ElectronApplication }, paths: string[]) =>
    shelf.app.evaluate(({ BrowserWindow }, files) => BrowserWindow.getAllWindows()[0].webContents.send("open-files", files), paths);

  test("comes in a book at a time, every format together, with Calibre's details", async ({ shelf }) => {
    const { page } = shelf;
    const { root } = calibreLibrary();
    try {
      await hand(shelf, [root]);
      await expect(page.getByText("Added 1 book", { exact: true })).toBeVisible();
      await expect(page.locator("main [draggable=true]")).toHaveCount(1);
      await expect(card(page, "The Ruins of Gorlan")).toContainText("John Flanagan");
      await card(page, "The Ruins of Gorlan").click();
      const details = page.locator("aside");
      await expect(details.getByText("EPUB", { exact: true })).toBeVisible();
      await expect(details.getByText("FB2", { exact: true })).toBeVisible();
      await expect(details.getByText("Ranger's Apprentice", { exact: false }).first()).toBeVisible();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("its files handed over one at a time join up as they come", async ({ shelf }) => {
    const { page } = shelf;
    const { root, epubFile, fb2File } = calibreLibrary();
    try {
      // A single file handed over opens to read, as from Finder or Explorer; the second
      // is the same book, so it joins the first, and that one opens.
      for (const file of [epubFile, fb2File]) {
        await hand(shelf, [file]);
        await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(0);
      }
      await expect(page.locator("main [draggable=true]")).toHaveCount(1);
      await expect(card(page, "The Ruins of Gorlan")).toContainText("John Flanagan");
      await card(page, "The Ruins of Gorlan").click();
      await expect(page.locator("aside").getByText("FB2", { exact: true })).toBeVisible();
      // Brought in again as a whole, nothing more comes in.
      await hand(shelf, [root]);
      await expect(page.getByText("Those books are already here")).toBeVisible();
      await expect(page.locator("main [draggable=true]")).toHaveCount(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("holding one book twice, an EPUB and an FB2 in folders of their own, gives one book", async ({ shelf }) => {
    const { page } = shelf;
    const root = mkdtempSync(join(tmpdir(), "shelf-calibre-"));
    try {
      const opf = `<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>The King of the West: (Path of the Ranger Book 7)</dc:title><dc:creator opf:role="aut">Pedro Urvi</dc:creator></metadata></package>`;
      // As Calibre keeps a book added twice, once per format.
      const first = join(root, "Pedro Urvi", "The King of the West_ (Path of the Ranger Book 7) (45)");
      const second = join(root, "Pedro Urvi", "The King of the West_ (Path of the Ranger Book 7) (46)");
      for (const dir of [first, second]) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "metadata.opf"), opf);
      }
      writeFileSync(join(first, "The King of the West_ (Path of the Ranger Book 7) - Pedro Urvi.epub"), epub({ title: "The King of the West", author: "Pedro Urvi" }));
      writeFileSync(
        join(second, "The King of the West_ (Path of the Ranger Book 7) - Pedro Urvi.fb2"),
        `<?xml version="1.0" encoding="UTF-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><author><first-name>Pedro</first-name><last-name>Urvi</last-name></author><book-title>The King of the West</book-title><lang>en</lang></title-info></description><body><section><p>West.</p></section></body></FictionBook>`,
      );
      await hand(shelf, [root]);
      await expect(page.getByText("1 copy joined to its book", { exact: false })).toBeVisible();
      await expect(page.locator("main [draggable=true]")).toHaveCount(1);
      await card(page, "The King of the West").click();
      const details = page.locator("aside");
      await expect(details.getByText("EPUB", { exact: true })).toBeVisible();
      await expect(details.getByText("FB2", { exact: true })).toBeVisible();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

test.describe("a library that came in from Calibre before copies joined up", () => {
  const PAIRS = 20;
  const SINGLES = 9;
  const cover = join(import.meta.dirname, "..", "site", "public", "media", "views.jpg");

  /** Like one imported before: each Pedro Urvi book twice, an EPUB and a MOBI in folders of their own, with covers. */
  test.use({
    library: { fill: (folder: string) => {
      const books: object[] = [];
      let n = 0;
      const add = (title: string, author: string, ext: string, body: Uint8Array | string) => {
        const id = `seed${String(n++).padStart(6, "0")}`;
        const dir = `${author}/${title.replace(/[:]/g, "")} (${id.slice(-4)})`;
        const file = `${title.replace(/[:]/g, "")} - ${author}.${ext}`;
        mkdirSync(join(folder, dir), { recursive: true });
        writeFileSync(join(folder, dir, file), body);
        copyFileSync(cover, join(folder, dir, "cover.jpg"));
        copyFileSync(cover, join(folder, dir, "thumb.jpg"));
        books.push({
          id, title, authors: [author], tags: [], collections: [], rating: 0, status: "unread", favorite: false,
          formats: [{ ext, file, size: typeof body === "string" ? body.length : body.byteLength }], dir, cover: 1,
          added: 1_700_000_000_000 + n, modified: 1_700_000_000_000 + n, parsed: true, hash: `hash-${id}`,
        });
      };
      for (let i = 1; i <= PAIRS; i++) {
        const title = `The King of the West: (Path of the Ranger Book ${i})`;
        add(title, "Pedro Urvi", "epub", epub({ title, author: "Pedro Urvi" }));
        add(title, "Pedro Urvi", "mobi", `a mobi of book ${i}`);
      }
      for (let i = 1; i <= SINGLES; i++) add(`A Book Alone ${i}`, "Ada Marsh", "epub", epub({ title: `A Book Alone ${i}`, author: "Ada Marsh" }));
      writeFileSync(join(folder, "library.json"), JSON.stringify({ version: 1, books, collections: [] }));
    } },
  });

  test("joins its copies from Settings, and Shelfed starts again after", async ({ shelf }) => {
    let { page } = shelf;
    const count = page.locator("header").getByText(String(PAIRS * 2 + SINGLES), { exact: true });
    await expect(count).toBeVisible();
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Library", exact: true }).click();
    await expect(dialog.getByText(`${PAIRS} books are copies`, { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: `Join ${PAIRS}` }).click();
    await expect(page.getByText(`Joined ${PAIRS} copies to their books`)).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole("button", { name: "None found" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("header").getByText(String(PAIRS + SINGLES), { exact: true })).toBeVisible();

    // Every joined book holds both files, and its series came out of its title.
    await card(page, "The King of the West").click();
    const details = page.locator("aside");
    await expect(details.getByText("MOBI", { exact: true })).toBeVisible();
    await expect(details.getByText("Path of the Ranger", { exact: false }).first()).toBeVisible();

    // And it starts again, on the joined library.
    await shelf.restart();
    page = shelf.page;
    await expect(page.locator("header").getByText(String(PAIRS + SINGLES), { exact: true })).toBeVisible();
  });
});

test("a book downloaded while Shelfed is open comes in by itself, and a PDF doesn't", async ({ shelf }) => {
  const { page, downloads } = shelf;
  // As a browser does it: written under a name of its own, renamed when done.
  const partial = join(downloads, "The Night Ferry.epub.crdownload");
  writeFileSync(partial, epub({ title: "The Night Ferry", author: "Ada Marsh" }));
  renameSync(partial, join(downloads, "The Night Ferry.epub"));
  writeFileSync(join(downloads, "Invoice 2026-10.pdf"), "%PDF-1.4 an invoice");
  await expect(page.getByText("Added 1 book from your Downloads")).toBeVisible({ timeout: 15_000 });
  await expect(card(page, "The Night Ferry")).toBeVisible();
  await expect(page.locator("main [draggable=true]")).toHaveCount(1);
});

test("downloads stay out when that's turned off", async ({ shelf }) => {
  const { page, downloads } = shelf;
  await openSettings(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Library", exact: true }).click();
  await dialog.getByRole("switch", { name: "Add books you download" }).click();
  await page.keyboard.press("Escape");
  writeFileSync(join(downloads, "The Night Ferry.epub"), epub({ title: "The Night Ferry", author: "Ada Marsh" }));
  await page.waitForTimeout(4000);
  await expect(page.locator("main [draggable=true]")).toHaveCount(0);
});

test.describe("coming from Calibre", () => {
  test.use({
    calibre: {
      fill: (folder: string) => {
        const book = (author: string, dir: string, title: string, ext: string, body: string | Uint8Array, series?: [string, number]) => {
          mkdirSync(join(folder, author, dir), { recursive: true });
          writeFileSync(join(folder, author, dir, `${title} - ${author}.${ext}`), body);
          writeFileSync(
            join(folder, author, dir, "metadata.opf"),
            `<?xml version='1.0' encoding='utf-8'?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:title>${title}</dc:title><dc:creator opf:role="aut">${author}</dc:creator>${series ? `<meta name="calibre:series" content="${series[0]}"/><meta name="calibre:series_index" content="${series[1]}"/>` : ""}</metadata></package>`,
          );
        };
        book("John Flanagan", "The Ruins of Gorlan (1)", "The Ruins of Gorlan", "epub", epub({ title: "Gorlan", author: "Unknown" }), ["Ranger's Apprentice", 1]);
        book("John Flanagan", "The Burning Bridge (2)", "The Burning Bridge", "epub", epub({ title: "Bridge", author: "Unknown" }), ["Ranger's Apprentice", 2]);
        // One book Calibre kept twice, once per format.
        book("Jane Austen", "Emma (3)", "Emma", "epub", epub({ title: "Emma", author: "Jane Austen" }));
        book(
          "Jane Austen", "Emma (4)", "Emma", "fb2",
          `<?xml version="1.0" encoding="UTF-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>Emma</book-title><lang>en</lang></title-info></description><body><section><p>Emma.</p></section></body></FictionBook>`,
        );
      },
    },
  });

  test("Shelfed finds the Calibre library, offers it once, and says what came over", async ({ shelf }) => {
    let { page } = shelf;
    const offer = page.getByRole("dialog");
    await expect(offer.getByText("Coming from Calibre?")).toBeVisible();
    await expect(offer.getByText("Your Calibre library, 4 books")).toBeVisible();
    await offer.getByRole("button", { name: "Bring them over" }).click();
    await expect(offer.getByText("Your Calibre library is here")).toBeVisible({ timeout: 30_000 });
    const figure = (label: string) => offer.getByText(label, { exact: true }).locator("xpath=preceding-sibling::p[1]");
    await expect(figure("books")).toHaveText("3");
    await expect(figure("series")).toHaveText("1");
    await expect(figure("authors")).toHaveText("2");
    await expect(figure("copy joined")).toHaveText("1");
    await offer.getByRole("button", { name: "Done" }).click();
    await expect(card(page, "The Ruins of Gorlan")).toBeVisible();
    // Only once.
    await shelf.restart();
    page = shelf.page;
    await expect(card(page, "The Ruins of Gorlan")).toBeVisible();
    await expect(page.getByText("Coming from Calibre?")).toHaveCount(0);
  });
});

test.describe("in Czech", () => {
  test.use({ language: "cs" });

  test("speaks Czech everywhere, counting the Czech way", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await expect(page.getByText("Přidány 3 knihy")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rozečtené", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Hledat v knihách")).toBeVisible();
    // The same English word, said for its place: a book's state is "Čtu", the sidebar's place "Rozečtené".
    await card(page, "Salt and Ink").click();
    await expect(page.locator("aside").getByText("Čtu", { exact: true }).first()).toBeVisible();
    await card(page, "Salt and Ink").click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Poslat do Kindlu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByLabel("Přidat knihy", { exact: true }).click();
    await page.getByRole("menuitem", { name: "Nastavení" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Čtení", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Čtení" })).toBeVisible();
  });

  test("switches back to English from Settings, at once", async ({ shelf }) => {
    const { page } = shelf;
    await page.getByLabel("Přidat knihy", { exact: true }).click();
    await page.getByRole("menuitem", { name: "Nastavení" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Vzhled", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Jazyk" }).click();
    await page.getByRole("option", { name: "English", exact: true }).click();
    await expect(page.getByRole("button", { name: "All books", exact: true })).toBeVisible();
  });
});

test("an empty library starts with a few classics in one click", async ({ shelf }) => {
  const { page, free } = shelf;
  const classics: Array<[string, string]> = [
    ["Pride and Prejudice", "Jane Austen"], ["The Adventures of Sherlock Holmes", "Arthur Conan Doyle"], ["Dracula", "Bram Stoker"],
    ["The Great Gatsby", "F. Scott Fitzgerald"], ["Frankenstein", "Mary Shelley"], ["Alice's Adventures in Wonderland", "Lewis Carroll"],
    ["The Picture of Dorian Gray", "Oscar Wilde"], ["R.U.R.", "Karel Capek"],
  ];
  for (const [title, author] of classics) writeFileSync(join(free, `${title} - ${author}.epub`), epub({ title, author }));
  await page.getByRole("button", { name: "Start with a few classics" }).click();
  await expect(page.getByText("Added 8 books")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("header").getByText("8", { exact: true })).toBeVisible();
  await expect(card(page, "Dracula")).toBeVisible();
});

test("a suggested free book opens to say what it is, and can be added from there", async ({ shelf }) => {
  const { page, free } = shelf;
  writeFileSync(join(free, "The King in Yellow - Robert W. Chambers.epub"), epub({ title: "The King in Yellow", author: "Robert W. Chambers" }));
  await shelf.add([{ title: "The Picture of Dorian Gray", author: "Oscar Wilde" }, BOOKS[0]]);
  await card(page, "The Picture of Dorian Gray").click();
  await page.locator("aside").getByRole("button", { name: /The King in Yellow/ }).click();
  const info = page.getByRole("dialog", { name: "The King in Yellow" });
  await expect(info.getByRole("heading", { name: "The King in Yellow" })).toBeVisible();
  await expect(info.getByText("Robert W. Chambers")).toBeVisible();
  await expect(info.getByText("Decadent, beautiful and dangerous")).toBeVisible();
  await expect(info.getByText("What The King in Yellow is about.")).toBeVisible();
  await info.getByRole("button", { name: "Add for free" }).click();
  await expect(card(page, "The King in Yellow")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("header").getByText("3", { exact: true })).toBeVisible();
});

test("a book on the Classics page opens to say what it is, and can be added from there", async ({ shelf }) => {
  const { page, free } = shelf;
  writeFileSync(join(free, "Carmilla - J. Sheridan Le Fanu.epub"), epub({ title: "Carmilla", author: "J. Sheridan Le Fanu" }));
  await page.getByRole("button", { name: "Classics", exact: true }).click();
  await page.getByRole("button", { name: "Carmilla", exact: true }).click();
  const info = page.getByRole("dialog", { name: "Carmilla" });
  await expect(info.getByText("What Carmilla is about.")).toBeVisible();
  await info.getByRole("button", { name: "Add for free" }).click();
  await expect(info.getByRole("button", { name: "In Shelfed" })).toBeDisabled({ timeout: 30_000 });
  await info.getByRole("button", { name: "Close" }).click();
  await expect(info).toHaveCount(0);
  // The words under the cover open it too.
  await page.locator("main button").filter({ hasText: /^CarmillaJ\. Sheridan Le Fanu$/ }).click();
  await expect(info).toBeVisible();
});

test.describe("the polish that has to stay", () => {
  test("an empty library has its welcome in the middle, with no empty panel beside it", async ({ shelf }) => {
    const { page } = shelf;
    await expect(page.getByRole("button", { name: "Add books", exact: true }).first()).toBeVisible();
    await expect(page.locator("main aside")).toHaveCount(0);
    await expect(page.getByLabel("Details", { exact: true })).toHaveCount(0);
  });

  test("the list keeps titles readable in a small window, and shows more as it grows", async ({ shelf }) => {
    const { app, page } = shelf;
    await shelf.add();
    await page.getByRole("radio", { name: "List" }).click();
    const title = page.locator("main table span.font-medium").getByText("The Lighthouse Keeper", { exact: true });
    const fits = () => title.evaluate((el) => el.scrollWidth <= el.clientWidth && el.clientWidth > 100);
    await expect.poll(fits).toBe(true);
    await expect(page.getByRole("columnheader", { name: "Size" })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByText("Rows", { exact: true })).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 1000));
    await expect(page.getByRole("columnheader", { name: "Size" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Series" })).toBeVisible();
  });

  test("a long row of an author's books keeps every cover the same size", async ({ shelf }) => {
    const { page } = shelf;
    const many = Array.from({ length: 16 }, (_, i) => ({ title: i % 2 ? `The Very Long Title Number ${i}` : `Short ${i}`, author: "Ada Marsh" }));
    await shelf.add(many);
    await page.getByRole("button", { name: "Authors", exact: true }).click();
    const widths = await page.locator("main [draggable=true]").evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().width)));
    expect(widths.length).toBeGreaterThan(8);
    expect(new Set(widths).size).toBe(1);
  });

  test("a book's state is called the same everywhere", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await card(page, "Salt and Ink").click();
    await expect(page.locator("main aside").getByRole("radio", { name: "Want to read" }).first()).toBeVisible();
    await expect(page.getByText("To read", { exact: true })).toHaveCount(0);
    await card(page, "Salt and Ink").click({ button: "right" });
    await expect(page.getByRole("menuitemradio", { name: "Mark as finished" })).toBeVisible();
  });

  test("the side panel's numbers follow a search, and don't say 0% of nothing", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await page.keyboard.press("Escape");
    const panel = page.locator("aside");
    await expect(panel.getByText("3", { exact: true })).toBeVisible();
    await expect(panel.getByText("None yet", { exact: true })).toBeVisible();
    await page.getByPlaceholder("Search your books").fill("orchard");
    await expect(panel.getByText("1", { exact: true })).toBeVisible();
    await page.getByPlaceholder("Search your books").fill("nothing like this at all");
    await expect(panel.getByText("Books", { exact: true })).toHaveCount(0);
  });

  test("the free books get the whole window until one is selected", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await page.getByRole("button", { name: "Classics", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Something to read next" })).toBeVisible();
    await expect(page.locator("main aside")).toHaveCount(0);
  });

  test("a new version stays in sight until it's dealt with", async ({ shelf }) => {
    const { app, page } = shelf;
    await shelf.add();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send("update", { state: "available", version: "9.9.9", url: "https://example.com" }));
    const marker = page.getByRole("button", { name: "Shelfed 9.9.9 is out" });
    await expect(marker).toBeVisible();
    // Long after any pop-up has gone.
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "Reading", exact: true }).click();
    await expect(marker).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send("update", { state: "ready", version: "9.9.9" }));
    await expect(page.getByRole("button", { name: "Restart to update" }).first()).toBeVisible();
  });

  test.describe("in Czech, in a small window", () => {
    test.use({ language: "cs" });
    test("every button in the header fits, whole", async ({ shelf }) => {
      const { page } = shelf;
      await shelf.add();
      const header = await page.locator("header").evaluate((el) => {
        const edge = el.getBoundingClientRect().right;
        return [...el.querySelectorAll("button")].map((b) => {
          const box = b.getBoundingClientRect();
          return { width: box.width, inside: box.right <= edge + 0.5 };
        });
      });
      expect(header.length).toBeGreaterThan(5);
      expect(header.every((b) => b.inside), "a button runs off the edge").toBe(true);
      expect(header.filter((b) => b.width > 0).every((b) => b.width >= 24), "a button is squeezed").toBe(true);
    });
  });

  test.describe("the 3D bookcase", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...BOOKS[i % BOOKS.length], title: `${BOOKS[i % BOOKS.length].title} ${i + 1}` }));
    const whole = (page: Page) => page.locator("main .book-whole");
    /** A book near the top: which one varies, and shelves far off screen aren't built at all. */
    const spine = (page: Page, n = 3) => page.locator("main .group[draggable=true]").nth(n);

    async function open(shelf: { page: Page; add: (books: typeof many) => Promise<void> }) {
      await shelf.add(many);
      await shelf.page.keyboard.press("Escape");
      await shelf.page.getByRole("radio", { name: "Bookcase in 3D" }).click();
      await expect(spine(shelf.page)).toBeVisible();
      await shelf.page.mouse.move(2, 2);
      await expect(whole(shelf.page)).toHaveCount(0);
    }

    test("builds only what can be seen", async ({ shelf }) => {
      await open(shelf);
      const look = () =>
        shelf.page.evaluate(() => {
          const books = document.querySelectorAll("main .group[draggable=true]").length;
          const planes = [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).transform !== "none").length;
          return { books, ratio: planes / books, covers: document.querySelectorAll("main [style*='container-type']").length };
        });
      // Once the view it came from has faded out: no covers on sides nobody sees.
      await expect.poll(async () => (await look()).covers).toBe(0);
      const counts = await look();
      expect(counts.books).toBeGreaterThan(10);
      // There used to be over five planes a book. A shelf's own boards count too, so a small window reads higher.
      expect(counts.ratio).toBeLessThan(3.5);
    });

    test("a book pointed at rises whole, and settles back", async ({ shelf }) => {
      const { page } = shelf;
      await open(shelf);
      await spine(page).hover();
      await expect(whole(page)).toHaveCount(1);
      await page.mouse.move(2, 2);
      await expect(whole(page)).toHaveCount(0);
    });

    test("a book picked turns out its cover, and goes back when let go", async ({ shelf }) => {
      const { page } = shelf;
      await open(shelf);
      await spine(page).click();
      await expect(page.locator("main aside").getByRole("radio", { name: "Want to read" }).first()).toBeVisible();
      await page.mouse.move(2, 2);
      await expect(whole(page)).toHaveCount(1);
      await expect(whole(page).locator("[style*='container-type']")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(whole(page)).toHaveCount(0);
    });

    test("a spine still opens a book, and has its menu", async ({ shelf }) => {
      const { page } = shelf;
      await open(shelf);
      await spine(page).click({ button: "right" });
      await expect(page.getByRole("menuitemradio", { name: "Mark as finished" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.mouse.move(2, 2);
      await spine(page, 5).dblclick();
      await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    });

    test("a picked book can be opened from its turned-out cover", async ({ shelf }) => {
      const { page } = shelf;
      await open(shelf);
      await spine(page).click();
      await page.mouse.move(2, 2);
      await expect(whole(page).locator("[style*='container-type']")).toHaveCount(1);
      await page.waitForTimeout(600);
      const cover = await whole(page).locator("[style*='container-type']").boundingBox();
      await page.mouse.dblclick(cover!.x + cover!.width / 2, cover!.y + cover!.height / 2);
      await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    });

    test("no book stays pulled up once the pointer has gone, even after scrolling under it", async ({ shelf }) => {
      const { page } = shelf;
      await open(shelf);
      await spine(page).hover();
      await expect(whole(page)).toHaveCount(1);
      for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 200);
      await page.mouse.move(2, 2);
      await expect(whole(page)).toHaveCount(0);
    });

    test("shelves far off screen aren't built, and appear when scrolled to", async ({ shelf }) => {
      const { app, page } = shelf;
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 620));
      await shelf.add(Array.from({ length: 120 }, (_, i) => ({ ...BOOKS[i % BOOKS.length], title: `${BOOKS[i % BOOKS.length].title} ${i + 1}` })));
      await page.keyboard.press("Escape");
      await page.getByRole("radio", { name: "Bookcase in 3D" }).click();
      await expect(spine(page)).toBeVisible();
      const built = () => page.locator("main .group[draggable=true]").count();
      await expect.poll(built).toBeLessThan(120);
      const before = await page.locator("main .group[draggable=true]").first().textContent();
      await page.mouse.move(400, 300);
      for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 400);
      await expect.poll(() => page.locator("main .group[draggable=true]").first().textContent()).not.toBe(before);
    });
  });

  test("the bottom of the sidebar stays in reach in a short window", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    const collapse = page.getByRole("button", { name: "Collapse", exact: true });
    await expect(collapse).toBeInViewport({ ratio: 1 });
  });

  test("the reader's page follows the app, and its controls follow the page", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    const background = () => page.locator(".fixed.inset-0.z-\\[45\\]").evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload();
    await expect(page.getByRole("button", { name: "All books" })).toBeVisible();
    await card(page, "The Lighthouse Keeper").dblclick();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    await expect.poll(background).toBe("rgb(27, 27, 28)");
    // Paper chosen in a dark app: a light page, with controls drawn for a light page.
    await page.getByRole("button", { name: "Text and page" }).click();
    await page.getByRole("button", { name: "Aa Paper", exact: true }).click();
    await expect.poll(background).toBe("rgb(251, 250, 247)");
    await expect(page.locator(".fixed.inset-0.z-\\[45\\]")).toHaveClass(/\blight\b/);
  });
});

test.describe("the book features", () => {
  /** Changes books in the library directly, by title, then reloads so the page sees it. */
  async function change(page: Page, patches: Record<string, Record<string, unknown>>) {
    await page.evaluate(async (all) => {
      const { books } = (await window.shelf.call("boot")) as { books: Array<{ id: string; title: string }> };
      for (const book of books) if (all[book.title]) await window.shelf.call("update", book.id, all[book.title]);
    }, patches);
    await page.reload();
    await expect(page.getByRole("button", { name: "All books" })).toBeVisible();
  }

  test("a commonplace book gathers every line, searches them, and opens where one was marked", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await page.getByRole("button", { name: "Commonplace book", exact: true }).click();
    await expect(page.getByText("Nothing marked yet")).toBeVisible();
    await change(page, {
      "Salt and Ink": { annotations: [{ id: "a", kind: "highlight", created: 2, text: "The sea remembers everything", note: "Lovely" }, { id: "k", kind: "kindle", created: 1, text: "From a Kindle", where: "Location 180" }, { id: "b", kind: "bookmark", created: 3, cfi: "x" }] },
      "A Winter Orchard": { annotations: [{ id: "c", kind: "highlight", created: 9, text: "Frost on the žluté apples" }] },
    });
    await page.getByRole("button", { name: "Commonplace book", exact: true }).click();
    const main = page.locator("main");
    await expect(main.getByText("3 lines")).toBeVisible();
    await expect(main.getByText("The sea remembers everything")).toBeVisible();
    await expect(main.getByText("Lovely")).toBeVisible();
    await expect(main.getByText("Location 180")).toBeVisible();
    // Accents don't matter, and nothing else stays when searching.
    await page.getByPlaceholder("Search what you've marked").fill("zlute");
    await expect(main.getByText("Frost on the žluté apples")).toBeVisible();
    await expect(main.getByText("The sea remembers everything")).toHaveCount(0);
    await page.getByPlaceholder("Search what you've marked").fill("no such words");
    await expect(main.getByText("Nothing you've marked says that.")).toBeVisible();
    await expect(page.locator("main aside")).toHaveCount(0);
  });

  test("the last page marks the moment, takes a rating and says what's next in the series", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add([{ title: "Book One", author: "Ada Marsh", series: "Tides" }, { title: "Book Two", author: "Ada Marsh", series: "Tides" }]);
    await change(page, { "Book One": { seriesIndex: 1 }, "Book Two": { seriesIndex: 2 } });
    await card(page, "Book One").dblclick();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    await page.getByRole("slider").last().focus();
    await page.keyboard.press("End");
    const moment = page.getByRole("dialog", { name: "You finished Book One" });
    await expect(moment).toBeVisible({ timeout: 15_000 });
    await expect(moment.getByText("Next in Tides")).toBeVisible();
    await moment.getByRole("radio", { name: "4 stars" }).click();
    await expect(moment.getByRole("radio", { name: "4 stars" })).toHaveAttribute("aria-checked", "true");
    await moment.getByRole("button", { name: "Read Book Two" }).click();
    await expect(moment).toHaveCount(0);
    await expect(page.getByText("Book Two", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
  });

  test("the moment only comes once, and can be left to keep reading", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await card(page, "The Lighthouse Keeper").dblclick();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    await page.getByRole("slider").last().focus();
    await page.keyboard.press("End");
    const moment = page.getByRole("dialog", { name: "You finished The Lighthouse Keeper" });
    await expect(moment).toBeVisible({ timeout: 15_000 });
    await moment.getByRole("button", { name: "Keep reading" }).click();
    await expect(moment).toHaveCount(0);
    await page.getByRole("slider").last().focus();
    await page.keyboard.press("Home");
    await page.waitForTimeout(900);
    await page.keyboard.press("End");
    await page.waitForTimeout(1500);
    await expect(moment).toHaveCount(0);
  });

  test("in the bookcase, what's being read lies on a pile, and isn't on the shelf as well", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    // The case leaning toward the pointer isn't what this is about, and it would have the book on the move
    // as Playwright aims at it: each try moves the pointer, the case leans on, and the book is never still.
    await page.evaluate(() => window.shelf.call("settings", { bookcase: { lean: false } }));
    await change(page, { "Salt and Ink": { status: "reading", opened: 5, progress: 0.4 } });
    await page.getByRole("radio", { name: "Bookcase in 3D" }).click();
    await expect(page.locator("main .group[draggable=true]").first()).toBeVisible();
    await expect(page.locator("main .group[draggable=true]").filter({ hasText: "Salt and Ink" })).toHaveCount(1);
    const lying = await page.locator("main .group[draggable=true]").filter({ hasText: "Salt and Ink" }).evaluate((el) => el.getBoundingClientRect().width > el.getBoundingClientRect().height);
    expect(lying).toBe(true);
    await page.locator("main .group[draggable=true]").filter({ hasText: "Salt and Ink" }).dblclick();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
  });

  test("a series in the bookcase stands together, the same height, with a band", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add([{ title: "Alpha", author: "A", series: "Set" }, { title: "Loose", author: "B" }, { title: "Beta", author: "A", series: "Set" }, { title: "Gamma", author: "A", series: "Set" }]);
    await change(page, { Alpha: { seriesIndex: 1 }, Beta: { seriesIndex: 2 }, Gamma: { seriesIndex: 3 } });
    await page.getByRole("radio", { name: "Bookcase in 3D" }).click();
    const spines = page.locator("main .group[draggable=true]");
    await expect(spines).toHaveCount(4);
    const titles = (await spines.allTextContents()).map((text) => text.replace(/[^A-Za-z]/g, ""));
    const at = (word: string) => titles.findIndex((title) => title.startsWith(word));
    expect(Math.abs(at("Alpha") - at("Beta"))).toBe(1);
    expect(at("Gamma") - at("Beta")).toBe(1);
    const heights = await spines.evaluateAll((els) => els.filter((el) => /Alpha|Beta|Gamma/.test(el.textContent ?? "")).map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
  });

  test("the bookcase can run through the colours", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: "Bookcase in 3D" }).click();
    await page.getByLabel("Bookcase", { exact: true }).click();
    await page.getByRole("switch", { name: "Rainbow order" }).click();
    await expect(page.getByRole("switch", { name: "Rainbow order" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator("main .group[draggable=true]")).toHaveCount(3);
  });

  test("Settings offers what's new", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "About Shelfed", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "What's new" })).toBeVisible();
  });
});

test("reads a book aloud from the page, and stops", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  await card(page, "The Lighthouse Keeper").dblclick();
  await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
  // On someone's own computer the voice stays silent, so a test never talks over them.
  if (!process.env.CI) await page.evaluate(() => { speechSynthesis.speak = () => {}; });
  await page.getByRole("button", { name: "Read aloud" }).click();
  const bar = page.getByRole("button", { name: "Stop reading aloud" }).last();
  await expect(bar).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Pause|Read on)$/ })).toBeVisible();
  // On CI, where nobody hears it: with any system voice there, a voice is really speaking.
  if (process.env.CI)
    await expect.poll(() => page.evaluate(() => speechSynthesis.getVoices().length === 0 || speechSynthesis.speaking || speechSynthesis.pending), { timeout: 10_000 }).toBe(true);
  await page.getByRole("button", { name: "A paragraph on" }).click();
  await bar.click();
  await expect(page.getByRole("button", { name: "A paragraph on" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Read aloud" })).toBeVisible();
});

