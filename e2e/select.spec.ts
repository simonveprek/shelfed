import type { Page } from "@playwright/test";
import { expect, test } from "./shelf";

/*
 * Selecting books by drawing a box around them, as on a desktop.
 */

const titles = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Book ${String(i + 1).padStart(2, "0")}`, author: "Ada Marsh" }));

/** The titles of the books selected, by how they're shown. */
const picked = (page: Page) =>
  page.evaluate(async () => {
    const { books } = (await window.shelf.call("boot")) as { books: Array<{ id: string; title: string }> };
    const ids = [...document.querySelectorAll("main p.text-accent")].map((p) => p.textContent);
    return [...new Set(ids)].filter((t) => books.some((b) => b.title === t)).sort();
  });

/** The covers' scrolling view. */
const view = (page: Page) => page.locator("main .scroll").first();

/** The covers on screen, from the top of the view, in reading order: each one's title and where it sits. */
async function onScreen(page: Page) {
  await page.keyboard.press("Escape");
  await view(page).evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(300);
  const cards = await page.locator("main [draggable=true]").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { title: el.querySelector("p")?.textContent ?? "", x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  return cards.sort((a, b) => a.y - b.y || a.x - b.x);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, keep?: () => Promise<void>) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await keep?.();
  await page.mouse.up();
}

test.describe("drawing a box to select books", () => {
  test("selects every cover the box touches, and draws the box while dragging", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add(titles(6));
    const [first, second] = await onScreen(page);
    const area = (await view(page).boundingBox())!;
    // From the empty strip above the first row, across the first two covers.
    await drag(page, { x: first.x - 10, y: area.y + 8 }, { x: second.x + second.width / 2, y: first.y + first.height / 2 }, async () => {
      await expect(page.locator("[data-marquee]")).toBeVisible();
    });
    await expect(page.locator("[data-marquee]")).toHaveCount(0);
    expect(await picked(page)).toEqual([first.title, second.title].sort());
  });

  test("adds to what's selected with Cmd or Ctrl held, and a click on empty space clears it", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add(titles(6));
    const [first, second] = await onScreen(page);
    const area = (await view(page).boundingBox())!;
    await drag(page, { x: first.x - 10, y: area.y + 8 }, { x: first.x + first.width / 2, y: first.y + first.height / 2 });
    expect(await picked(page)).toEqual([first.title]);
    const third = second;
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(modifier);
    await drag(page, { x: third.x + third.width + 4, y: area.y + 8 }, { x: third.x + third.width / 2, y: third.y + third.height / 2 });
    await page.keyboard.up(modifier);
    expect(await picked(page)).toEqual([first.title, third.title].sort());
    // Without it, a new box starts over.
    await drag(page, { x: third.x + third.width + 4, y: area.y + 8 }, { x: third.x + third.width / 2, y: third.y + third.height / 2 });
    expect(await picked(page)).toEqual([third.title]);
    await page.mouse.click(first.x - 10, area.y + 8);
    expect(await picked(page)).toEqual([]);
  });

  test("Escape puts the selection back as it was before the box", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add(titles(4));
    const [first, , , last] = await onScreen(page);
    await page.mouse.click(last.x + last.width / 2, last.y + 20);
    const area = (await view(page).boundingBox())!;
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(modifier);
    await drag(page, { x: first.x - 10, y: area.y + 8 }, { x: first.x + first.width / 2, y: first.y + first.height / 2 }, async () => {
      expect(await picked(page)).toEqual([first.title, last.title].sort());
      await page.keyboard.press("Escape");
    });
    await page.keyboard.up(modifier);
    expect(await picked(page)).toEqual([last.title]);
  });

  test("scrolls on near the bottom edge, catching books that weren't on screen", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add(titles(40));
    const [first] = await onScreen(page);
    const area = (await view(page).boundingBox())!;
    await drag(page, { x: first.x - 10, y: area.y + 8 }, { x: area.x + area.width - 30, y: area.y + area.height - 6 }, async () => {
      await expect.poll(() => view(page).evaluate((el) => el.scrollTop), { timeout: 10_000 }).toBeGreaterThan(600);
    });
    // More selected than ever fit in the window at once, the ones scrolled past included, as the side panel counts them.
    const count = Number((await page.locator("aside.w-\\[340px\\]").getByText(/^\d+ books$/).first().textContent())?.split(" ")[0]);
    expect(count).toBeGreaterThanOrEqual(12);
    expect(count).toBeLessThanOrEqual(40);
  });

  test("works down the list too", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add(titles(6));
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: "List" }).click();
    const rows = page.locator("main tbody tr");
    await expect(rows).toHaveCount(6);
    const second = (await rows.nth(1).boundingBox())!;
    const fourth = (await rows.nth(3).boundingBox())!;
    // From the row's empty right side, not its title, down three rows.
    await drag(page, { x: second.x + second.width - 20, y: second.y + 6 }, { x: fourth.x + fourth.width - 30, y: fourth.y + fourth.height / 2 });
    await expect(page.locator("main tbody tr[aria-selected=true]")).toHaveCount(3);
  });
});
