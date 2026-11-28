import type { Page } from "@playwright/test";
import { entry } from "../test/pretend-hardcover";
import { expect, openSettings, test } from "./shelf";

/*
 * Hardcover, kept in step: against a pretend Hardcover whose sign-in page
 * says yes at once. The real one is never asked, and no browser opens.
 */

test.skip(Boolean(process.env.SHELF_APP), "An installed app is never pointed at a pretend Hardcover");
test.use({ hardcover: true });

const statusOf = (page: Page, title: string) =>
  page.evaluate(async (t) => ((await window.shelf.call("boot")) as { books: Array<{ title: string; status: string }> }).books.find((b) => b.title === t)?.status, title);

async function connect(page: Page) {
  await openSettings(page);
  const settings = page.getByRole("dialog");
  await settings.getByRole("button", { name: "Hardcover", exact: true }).click();
  await settings.getByRole("button", { name: "Connect Hardcover" }).click();
  await expect(settings.getByText("Connected as @reader")).toBeVisible({ timeout: 15_000 });
  return settings;
}

test("connecting brings what you finished on Hardcover into Shelfed", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  shelf.hardcover!.library.push(entry(1, "Salt and Ink", "Ada Marsh", 3, { rating: 4 }));
  const settings = await connect(page);
  await expect.poll(() => statusOf(page, "Salt and Ink")).toBe("finished");
  await expect(settings.getByText(/^In step/)).toBeVisible();
  expect(shelf.hardcover!.library[0].status_id).toBe(3);
});

test("a book finished in Shelfed is marked read on Hardcover, added there if it wasn't", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  shelf.hardcover!.catalogue.push({ id: 700, title: "A Winter Orchard", author: "Tomas Reed", edition: 7001, pages: 240 });
  await connect(page);
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    const { books } = (await window.shelf.call("boot")) as { books: Array<{ id: string; title: string }> };
    await window.shelf.call("update", books.find((b) => b.title === "A Winter Orchard")!.id, { status: "finished", rating: 5 });
  });
  await expect.poll(() => shelf.hardcover!.library.find((e) => e.book_id === 700), { timeout: 15_000 }).toMatchObject({ status_id: 3, rating: 5 });
});

test("the page can't change how a book stands with Hardcover, and disconnecting tells Hardcover to forget it", async ({ shelf }) => {
  const { page } = shelf;
  await shelf.add();
  shelf.hardcover!.library.push(entry(1, "Salt and Ink", "Ada Marsh", 2));
  const settings = await connect(page);
  const link = await page.evaluate(async () => {
    const { books } = (await window.shelf.call("boot")) as { books: Array<{ id: string; title: string; hardcover?: unknown }> };
    const book = books.find((b) => b.title === "Salt and Ink")!;
    await window.shelf.call("update", book.id, { hardcover: { id: 999, book: 1 } });
    return ((await window.shelf.call("boot")) as { books: Array<{ id: string; hardcover?: { id: number } }> }).books.find((b) => b.id === book.id)?.hardcover;
  });
  expect(link?.id).toBe(1);
  await settings.getByRole("button", { name: "Disconnect" }).click();
  await expect(settings.getByRole("button", { name: "Connect Hardcover" })).toBeVisible();
  expect(shelf.hardcover!.revoked).toHaveLength(1);
});
