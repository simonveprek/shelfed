import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  });

  test("takes finished books off it, after asking, and keeps them in the library", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await card(page, "Salt and Ink").click({ button: "right" });
    await page.getByRole("menuitemradio", { name: "Read it" }).click();
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
    await page.getByRole("option", { name: "English" }).click();
    await expect(page.getByRole("button", { name: "All books", exact: true })).toBeVisible();
  });
});

