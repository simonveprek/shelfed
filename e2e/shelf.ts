import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { strToU8, zipSync } from "fflate";

const root = resolve(import.meta.dirname, "..");

type Fake = { title: string; author: string; series?: string };

/** Made-up books, two by one author so authors have something to group. */
export const BOOKS: Fake[] = [
  { title: "The Lighthouse Keeper", author: "Ada Marsh", series: "Coastlines" },
  { title: "Salt and Ink", author: "Ada Marsh", series: "Coastlines" },
  { title: "A Winter Orchard", author: "Tomas Reed" },
];

const PARAGRAPH =
  "The tide came in slowly over the flats, and the gulls rose and settled again as if the whole shore were breathing. She kept the lamp trimmed and the log written, one line for every ship that passed.";

/** A small, valid EPUB 3. */
export function epub({ title, author, series }: Fake) {
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:shelf-test:${encodeURIComponent(title)}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
    ${series ? `<meta name="calibre:series" content="${series}"/>` : ""}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="one" href="one.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="one"/></spine>
</package>`;
  const page = (body: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head><body>${body}</body></html>`;
  return zipSync({
    // The mimetype comes first and uncompressed, as EPUB asks.
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    "OEBPS/content.opf": strToU8(opf),
    "OEBPS/nav.xhtml": strToU8(page(`<nav epub:type="toc"><ol><li><a href="one.xhtml">One</a></li></ol></nav>`)),
    "OEBPS/one.xhtml": strToU8(page(`<h1>One</h1>${`<p>${PARAGRAPH}</p>`.repeat(40)}`)),
  });
}

export type Shelf = {
  app: ElectronApplication;
  page: Page;
  /** Errors the page threw or logged. Each test fails if there are any. */
  errors: string[];
  /** Adds books the way the system hands Shelfed files, as from Finder or Explorer. */
  add(books?: Fake[]): Promise<void>;
  /** Quits and starts again on the same library. */
  restart(): Promise<void>;
  /** The Downloads folder this Shelfed watches. */
  downloads: string;
  /** A folder of "Title - Author.epub" files standing in for Standard Ebooks. */
  free: string;
};

/** Each test gets its own Shelfed, on its own empty library, never yours. */
type Options = {
  /** A demo Kindle plugged in from the start: a drive, or one that connects like a phone. */
  kindle: "drive" | "phone" | undefined;
  /** Book files already in that drive Kindle's documents folder. */
  onKindle: string[];
  /** Fills the library folder before Shelfed starts, for a library that's been around a while. */
  library: { fill: (folder: string) => void } | undefined;
  /** A Calibre library on this pretend computer, filled by the test, for Shelfed to find. */
  calibre: { fill: (folder: string) => void } | undefined;
  /** The language Shelfed speaks. English unless a test asks, whatever the computer's own. */
  language: "en" | "cs";
};

export const test = base.extend<{ shelf: Shelf } & Options>({
  kindle: [undefined, { option: true }],
  onKindle: [[], { option: true }],
  library: [undefined, { option: true }],
  calibre: [undefined, { option: true }],
  language: ["en", { option: true }],
  shelf: async ({ kindle, onKindle, library, calibre, language }, use) => {
    const dir = mkdtempSync(join(tmpdir(), "shelf-e2e-"));
    const data = join(dir, "data");
    mkdirSync(data);
    mkdirSync(join(dir, "Downloads"));
    mkdirSync(join(dir, "free"));
    // Calibre's settings, empty unless the test gives it a library, so the real one is never found.
    mkdirSync(join(dir, "calibre-config"));
    if (calibre) {
      const books = join(dir, "Calibre Library");
      mkdirSync(books);
      writeFileSync(join(books, "metadata.db"), "");
      calibre.fill(books);
      writeFileSync(join(dir, "calibre-config", "global.py.json"), JSON.stringify({ library_path: books }));
    }
    writeFileSync(
      join(data, "settings.json"),
      JSON.stringify({ libraryPath: join(dir, "Library"), onboarded: true, inspector: true, sidebar: true, updates: false, language }),
    );
    if (library) {
      mkdirSync(join(dir, "Library"), { recursive: true });
      library.fill(join(dir, "Library"));
    }
    // Always the small window GitHub's Mac runners open, so a book can sit half
    // out of view and the tests meet what a small screen does, wherever they run.
    writeFileSync(join(data, "window.json"), JSON.stringify({ x: 0, y: 0, width: 1024, height: 677 }));
    // The demo Kindle's drive, with whatever books are already on it.
    const demo = kindle === "phone" ? "phone" : kindle === "drive" ? join(dir, "Kindle") : undefined;
    if (kindle === "drive") {
      mkdirSync(join(dir, "Kindle", "documents"), { recursive: true });
      for (const file of onKindle) writeFileSync(join(dir, "Kindle", "documents", file), "a book");
    }
    const errors: string[] = [];
    let app!: ElectronApplication;
    let page!: Page;
    let made = 0;

    const launch = async () => {
      // Linux CI can't run Chromium's sandbox. Windows calls a window hidden when it
      // thinks something covers it, and Shelfed stops looking for Kindles while hidden.
      const args = ["."];
      if (process.platform === "linux" && process.env.CI) args.push("--no-sandbox");
      if (process.platform === "win32") args.push("--disable-features=CalculateNativeWinOcclusion");
      const env = {
        ...process.env,
        SHELF_USERDATA: data,
        // A Downloads folder of its own, never the real one.
        SHELF_DOWNLOADS: join(dir, "Downloads"),
        SHELF_CALIBRE_CONFIG: join(dir, "calibre-config"),
        SHELF_FREE_DIR: join(dir, "free"),
        ...(demo ? { SHELF_DEMO_KINDLE: demo } : {}),
        // On someone's own computer the test books are deleted, not put in their Trash.
        ...(process.env.CI ? {} : { SHELF_NO_TRASH: "1" }),
      };
      // SHELF_APP=<the packaged app's executable> tests an installer's app instead of the build.
      app = process.env.SHELF_APP
        ? await electron.launch({ executablePath: process.env.SHELF_APP, args: args.slice(1), env })
        : await electron.launch({ args, cwd: root, env });
      page = await app.firstWindow();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      await expect(page.getByRole("button", { name: language === "cs" ? "Všechny knihy" : "All books" })).toBeVisible();
    };
    await launch();

    await use({
      get app() {
        return app;
      },
      get page() {
        return page;
      },
      errors,
      downloads: join(dir, "Downloads"),
      free: join(dir, "free"),
      async add(books = BOOKS) {
        const paths = books.map((book) => {
          const path = join(dir, `in-${made++}.epub`);
          writeFileSync(path, epub(book));
          return path;
        });
        await app.evaluate(({ BrowserWindow }, files) => BrowserWindow.getAllWindows()[0].webContents.send("open-files", files), paths);
        for (const book of books) await expect(page.locator("main").getByText(book.title).first()).toBeVisible();
      },
      async restart() {
        await app.close();
        await launch();
      },
    });

    await app.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    expect(errors, "errors on the page").toEqual([]);
  },
});

export { expect };

/** A book's cover in the library, by its title. */
export const card = (page: Page, title: string) => page.locator("main [draggable=true]").filter({ hasText: title }).first();

/** Settings, from the add books menu in the header. */
export async function openSettings(page: Page) {
  await page.getByLabel("Add books", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
}
