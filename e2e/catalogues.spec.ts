import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import { card, epub, expect, test } from "./shelf";

/*
 * Catalogues you add yourself. A folder stands in for the web: a file at
 * catalogue.test/opds/new is what https://catalogue.test/opds/new answers,
 * with a query in its name, so nothing here goes online.
 */

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** Puts a file where an address would find it. */
function put(folder: string, address: string, body: string | Uint8Array) {
  const { host, pathname, search } = new URL(address);
  const path = join(folder, host, `${decodeURIComponent(pathname).replace(/\/$/, "/index")}${search ? encodeURIComponent(search) : ""}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

const feed = (title: string, body: string, extra = "") =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${title}</title><link rel="search" type="application/atom+xml" href="/search?q={searchTerms}"/>${extra}${body}</feed>`;
const book = (title: string, author: string, links: string) =>
  `<entry><title>${title}</title><author><name>${author}</name></author><id>urn:${encodeURIComponent(title)}</id><summary>All about ${title}.</summary>${links}</entry>`;
const free = (slug: string) => `<link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/books/${slug}.epub"/>`;
const place = (title: string, href: string, what = "") => `<entry><title>${title}</title><link rel="subsection" type="application/atom+xml;profile=opds-catalog" href="${href}"/><content type="text">${what}</content></entry>`;

/** A small home catalogue, the way a Calibre server would serve it. */
function serve(folder: string) {
  const at = (path: string, body: string | Uint8Array) => put(folder, `https://catalogue.test${path}`, body);
  at("/opds/", feed("Home Library", place("New books", "/opds/new", "The latest") + place("Gone missing", "/opds/missing")));
  const moonfleet = book("Moonfleet", "J. Meade Falkner", `${free("moonfleet")}<link rel="http://opds-spec.org/image/thumbnail" type="image/png" href="/covers/moonfleet.png"/>`);
  at("/opds/new", feed("New books", moonfleet + book("Bought Book", "A. Seller", '<link rel="http://opds-spec.org/acquisition/buy" type="application/epub+zip" href="https://shop.test/b.epub"/>') + book("Salt and Ink", "Ada Marsh", free("salt")), '<link rel="next" type="application/atom+xml" href="/opds/new?page=2"/>'));
  at("/opds/new?page=2", feed("New books", book("Kidnapped", "Robert Louis Stevenson", free("kidnapped"))));
  at("/search?q=moon", feed("Search", moonfleet));
  at("/books/moonfleet.epub", epub({ title: "Moonfleet", author: "J. Meade Falkner" }));
  at("/books/kidnapped.epub", epub({ title: "Kidnapped", author: "Robert Louis Stevenson" }));
  at("/covers/moonfleet.png", PNG);
}

async function addCatalogue(page: Page, address: string, labels = { add: "Add a catalogue", button: "Add" }) {
  await page.getByRole("button", { name: labels.add, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: labels.add });
  await dialog.getByRole("textbox").fill(address);
  await dialog.getByRole("button", { name: labels.button, exact: true }).click();
  return dialog;
}

const main = (page: Page) => page.locator("main");

test.describe("a catalogue you add", () => {
  test("adds one by its address, goes into it, searches it, and adds a book from it", async ({ shelf }) => {
    const { page } = shelf;
    serve(shelf.opds);
    const dialog = await addCatalogue(page, "https://catalogue.test/nothing");
    await expect(dialog.getByText("catalogue.test has nothing at that address.")).toBeVisible();
    await dialog.getByRole("textbox").fill("https://catalogue.test/opds/");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();

    // It joins the sidebar under its own name, and opens.
    await expect(page.getByRole("button", { name: "Home Library", exact: true })).toBeVisible();
    await main(page).getByRole("button", { name: /New books/ }).click();
    await expect(main(page).getByRole("button", { name: "Moonfleet", exact: true })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Not free" })).toBeDisabled();
    await expect.poll(() => main(page).locator("img").first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

    await main(page).getByRole("button", { name: "Moonfleet" }).first().click();
    const info = page.getByRole("dialog", { name: "Moonfleet" });
    await expect(info.getByText("All about Moonfleet.")).toBeVisible();
    await info.getByRole("button", { name: "Add" }).click();
    await expect(info.getByRole("button", { name: "In Shelfed" })).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Escape");

    // Back to its start, and a search.
    await main(page).getByRole("button", { name: "Home Library" }).click();
    await main(page).getByPlaceholder("Title or author").fill("moon");
    await main(page).getByPlaceholder("Title or author").press("Enter");
    await expect(main(page).getByText("Results for moon")).toBeVisible();
    await expect(main(page).getByRole("button", { name: "In Shelfed" })).toBeVisible();

    // Removed, it goes from the sidebar; the book stays.
    await main(page).getByRole("button", { name: "Catalogue", exact: true }).click();
    await page.getByRole("menuitem", { name: "Remove this catalogue" }).click();
    await expect(page.getByRole("button", { name: "Home Library", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "All books", exact: true }).click();
    await expect(card(page, "Moonfleet")).toBeVisible();
  });

  test("shows more of a long shelf, and knows the books you already have", async ({ shelf }) => {
    const { page } = shelf;
    serve(shelf.opds);
    await shelf.add();
    await addCatalogue(page, "https://catalogue.test/opds/");
    await main(page).getByRole("button", { name: /New books/ }).click();
    await expect(main(page).getByRole("button", { name: "Salt and Ink", exact: true })).toBeVisible();
    // Salt and Ink is in the library already.
    await expect(main(page).getByRole("button", { name: "In Shelfed" })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Kidnapped", exact: true })).toHaveCount(0);
    await main(page).getByRole("button", { name: "Show more" }).click();
    await expect(main(page).getByRole("button", { name: "Kidnapped", exact: true })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Moonfleet", exact: true })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Show more" })).toHaveCount(0);
  });

  test("a book it only sells says why it can't be added", async ({ shelf }) => {
    const { page } = shelf;
    serve(shelf.opds);
    await addCatalogue(page, "https://catalogue.test/opds/");
    await main(page).getByRole("button", { name: /New books/ }).click();
    await main(page).getByRole("button", { name: "Bought Book", exact: true }).click();
    const info = page.getByRole("dialog", { name: "Bought Book" });
    await expect(info.getByText("This catalogue only sells or lends this one", { exact: false })).toBeVisible();
    await expect(info.getByRole("button", { name: "Not free" })).toBeDisabled();
  });

  test("a shelf that doesn't answer says so, and you can go back or try again", async ({ shelf }) => {
    const { page } = shelf;
    serve(shelf.opds);
    await addCatalogue(page, "https://catalogue.test/opds/");
    await main(page).getByRole("button", { name: /Gone missing/ }).click();
    await expect(main(page).getByText("The catalogue did not answer")).toBeVisible();
    await expect(main(page).getByText("catalogue.test has nothing at that address.")).toBeVisible();
    // Put there now, trying again finds it.
    put(shelf.opds, "https://catalogue.test/opds/missing", feed("Found again", book("Kidnapped", "Robert Louis Stevenson", free("kidnapped"))));
    await main(page).getByRole("button", { name: "Try again" }).click();
    await expect(main(page).getByRole("heading", { name: "Found again" })).toBeVisible();
    await main(page).getByRole("button", { name: "Home Library" }).click();
    await expect(main(page).getByRole("button", { name: /New books/ })).toBeVisible();
  });

  test("going back after a failure leaves you where you were", async ({ shelf }) => {
    const { page } = shelf;
    serve(shelf.opds);
    await addCatalogue(page, "https://catalogue.test/opds/");
    await main(page).getByRole("button", { name: /Gone missing/ }).click();
    await expect(main(page).getByText("The catalogue did not answer")).toBeVisible();
    await main(page).getByRole("button", { name: "Back", exact: true }).click();
    await expect(main(page).getByRole("button", { name: /New books/ })).toBeVisible();
  });

  test("reads OPDS 2 catalogues too", async ({ shelf }) => {
    const { page } = shelf;
    const at = (path: string, body: string | Uint8Array) => put(shelf.opds, `https://json.test${path}`, body);
    at(
      "/home.json",
      JSON.stringify({
        metadata: { title: "Reading Room" },
        links: [{ rel: "self", href: "/home.json", type: "application/opds+json" }],
        navigation: [{ href: "/shelf.json", title: "The French shelf", type: "application/opds+json" }],
        publications: [
          {
            metadata: { title: "Voyage au centre de la Terre", author: { name: "Jules Verne" }, language: "fr", description: "<p>Un voyage <b>souterrain</b>.</p>" },
            links: [{ rel: "http://opds-spec.org/acquisition/open-access", href: "/verne.epub", type: "application/epub+zip" }],
            images: [{ href: "/verne.png", type: "image/png", width: 100 }],
          },
        ],
      }),
    );
    at("/shelf.json", JSON.stringify({ metadata: { title: "The French shelf" }, publications: [] }));
    at("/verne.epub", epub({ title: "Voyage au centre de la Terre", author: "Jules Verne" }));
    at("/verne.png", PNG);
    await addCatalogue(page, "https://json.test/home.json");
    await expect(page.getByRole("button", { name: "Reading Room", exact: true })).toBeVisible();
    await expect(main(page).getByRole("button", { name: /The French shelf/ })).toBeVisible();
    await main(page).getByRole("button", { name: "Voyage au centre de la Terre" }).first().click();
    const info = page.getByRole("dialog", { name: "Voyage au centre de la Terre" });
    await expect(info.getByText("Un voyage souterrain.")).toBeVisible();
    await info.getByRole("button", { name: "Add" }).click();
    await expect(info.getByRole("button", { name: "In Shelfed" })).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Escape");
    await main(page).getByRole("button", { name: /The French shelf/ }).click();
    await expect(main(page).getByText("This part of the catalogue is empty.")).toBeVisible();
  });

  test("stays after Shelfed starts again", async ({ shelf }) => {
    serve(shelf.opds);
    await addCatalogue(shelf.page, "https://catalogue.test/opds/");
    await expect(shelf.page.getByRole("button", { name: "Home Library", exact: true })).toBeVisible();
    await shelf.restart();
    const { page } = shelf;
    await page.getByRole("button", { name: "Home Library", exact: true }).click();
    await expect(main(page).getByRole("button", { name: /New books/ })).toBeVisible();
  });

  test("the page can't sneak a catalogue in, or send Shelfed anywhere a catalogue didn't link", async ({ shelf }) => {
    const { page } = shelf;
    serve(shelf.opds);
    await addCatalogue(page, "https://catalogue.test/opds/");
    await expect(page.getByRole("button", { name: "Home Library", exact: true })).toBeVisible();
    const results = await page.evaluate(async () => {
      const tryIt = (method: string, ...args: unknown[]) => window.shelf.call(method, ...args).then((value) => ({ value }), (error: Error) => ({ error: error.message }));
      const settings = (await window.shelf.call("settings", { catalogues: [{ id: "x", name: "Sneaky", url: "https://evil.test/" }] })) as { catalogues?: Array<{ name: string }> };
      const cover = await fetch(`shelf://catalogue/?u=${encodeURIComponent("https://evil.test/track.png")}`).then((res) => res.status);
      return {
        names: settings.catalogues?.map((c) => c.name),
        page: await tryIt("cataloguePage", "https://evil.test/"),
        local: await tryIt("cataloguePage", "file:///etc/passwd"),
        download: await tryIt("downloadFromCatalogue", "https://evil.test/x.epub", "x", "epub"),
        search: await tryIt("searchCatalogue", "https://evil.test/{searchTerms}", "x"),
        cover,
      };
    });
    expect(results.names).toEqual(["Home Library"]);
    expect(results.page).toEqual({ error: "Shelfed only follows a catalogue's own links." });
    expect(results.local).toEqual({ error: "Shelfed only follows a catalogue's own links." });
    expect(results.download).toEqual({ error: "Shelfed only follows a catalogue's own links." });
    expect(results.search).toEqual({ error: "Shelfed only follows a catalogue's own links." });
    expect(results.cover).toBe(404);
    await expect(page.getByRole("button", { name: "Sneaky", exact: true })).toHaveCount(0);
    // The refused cover is the one error this test asks for.
    await expect.poll(() => shelf.errors.some((e) => e.includes("404"))).toBe(true);
    shelf.errors.splice(0, shelf.errors.length, ...shelf.errors.filter((e) => !e.includes("404")));
  });
});

test.describe("a catalogue, in Czech", () => {
  test.use({ language: "cs" });

  test("is added, browsed and explained in Czech", async ({ shelf }) => {
    const { page } = shelf;
    serve(shelf.opds);
    const dialog = await addCatalogue(page, "https://catalogue.test/nothing", { add: "Přidat katalog", button: "Přidat" });
    await expect(dialog.getByText("Na této adrese catalogue.test nic nemá.")).toBeVisible();
    await dialog.getByRole("textbox").fill("https://catalogue.test/opds/");
    await dialog.getByRole("button", { name: "Přidat", exact: true }).click();
    await main(page).getByRole("button", { name: /New books/ }).click();
    await expect(main(page).getByRole("button", { name: "Není zdarma" })).toBeDisabled();
    await expect(main(page).getByRole("button", { name: "Zobrazit další" })).toBeVisible();
  });
});
