import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Frame, Page } from "@playwright/test";
import { card, expect, openSettings, test, type Shelf } from "./shelf";

/*
 * What 0.2 added around reading: the commonplace book, the moment a book is
 * finished, and a bookcase that knows what's being read.
 */

/** Changes books in the library directly, by title, then reloads so the page sees it. */
async function change(page: Page, patches: Record<string, Record<string, unknown>>) {
  await page.evaluate(async (all) => {
    const { books } = (await window.shelf.call("boot")) as { books: Array<{ id: string; title: string }> };
    for (const book of books) if (all[book.title]) await window.shelf.call("update", book.id, all[book.title]);
  }, patches);
  await page.reload();
  await expect(page.getByRole("button", { name: /^(All books|Všechny knihy)$/ })).toBeVisible();
}

/** Selects words on the book's page, the way a reader's pointer would. */
async function select(page: Page, words: string) {
  let frame: Frame | undefined;
  await expect
    .poll(async () => {
      for (const f of page.frames()) if (await f.evaluate(() => document.body?.innerText.includes("The tide came in")).catch(() => false)) frame = f;
      return Boolean(frame);
    })
    .toBe(true);
  await frame!.evaluate((words) => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const at = node.textContent!.indexOf(words);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + words.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      return;
    }
    throw new Error(`${words} isn't on the page`);
  }, words);
}

/** Keeps links the app opens in the browser from opening, and gives back the ones it tried. */
async function catchLinks(shelf: Shelf) {
  await shelf.app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as { opened?: string[] }).opened = opened;
    shell.openExternal = async (url: string) => void opened.push(url);
  });
  return () => shelf.app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []);
}

const bookcase = async (page: Page) => {
  await page.getByRole("radio", { name: "Bookcase in 3D" }).click();
  await expect(page.locator("main .group[draggable=true]").first()).toBeVisible();
};

test.describe("the commonplace book", () => {
  test("gathers a line marked while reading, copies it out, and opens the book where it was marked", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await card(page, "The Lighthouse Keeper").dblclick();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    // A book still laying out its first page as it opens puts the bar away, so on a slow machine it selects again.
    await expect(async () => {
      await select(page, "gulls rose and settled");
      await page.getByRole("button", { name: "yellow" }).click({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole("button", { name: "Back to the library" }).click();

    await page.getByRole("button", { name: "Commonplace book", exact: true }).click();
    const main = page.locator("main");
    await expect(main.getByText("1 line", { exact: true })).toBeVisible();
    await expect(main.getByText("gulls rose and settled")).toBeVisible();

    // Copied as Markdown, under the book's title; the clipboard itself is left alone.
    await page.evaluate(() => {
      navigator.clipboard.writeText = async (text: string) => void ((window as unknown as { copied: string }).copied = text);
    });
    await main.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.getByText("Copied as Markdown")).toBeVisible();
    const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
    expect(copied).toContain("# The Lighthouse Keeper");
    expect(copied).toContain("*Ada Marsh*");
    expect(copied).toContain("> gulls rose and settled");

    await main.getByRole("button", { name: "Open here" }).click();
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
  });
});

test.describe("finishing a book", () => {
  test("a book short enough to fit on one page isn't finished just by opening it", async ({ shelf }) => {
    const { page, app } = shelf;
    const dir = mkdtempSync(join(tmpdir(), "shelf-short-"));
    const path = join(dir, "A Short Note.txt");
    writeFileSync(path, "Back by six.\n\nThe key is under the stone.");
    await app.evaluate(({ BrowserWindow }, file) => BrowserWindow.getAllWindows()[0].webContents.send("open-files", [file]), path);
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(page.getByRole("dialog", { name: /You finished/ })).toHaveCount(0);
    const status = await page.evaluate(async () => ((await window.shelf.call("boot")) as { books: Array<{ title: string; status: string }> }).books.find((b) => b.title === "A Short Note")?.status);
    expect(status).not.toBe("finished");
    await page.getByRole("button", { name: "Back to the library" }).click();
    await expect(card(page, "A Short Note")).toBeVisible();
  });
});

test.describe("finishing a book, in Czech", () => {
  test.use({ language: "cs" });

  test("the moment is in Czech", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await card(page, "The Lighthouse Keeper").dblclick();
    await expect(page.getByRole("button", { name: "Další strana" })).toBeVisible();
    await page.getByRole("slider").last().focus();
    await page.keyboard.press("End");
    const moment = page.getByRole("dialog", { name: "Dočetli jste The Lighthouse Keeper" });
    await expect(moment).toBeVisible({ timeout: 15_000 });
    await expect(moment.getByText("Jak se vám líbila?")).toBeVisible();
    await moment.getByRole("button", { name: "Číst dál" }).click();
    await expect(moment).toHaveCount(0);
  });

  test("the commonplace book is a zápisník citátů, counting the Czech way", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await change(page, {
      "Salt and Ink": { annotations: [{ id: "a", kind: "highlight", created: 2, text: "První" }, { id: "b", kind: "highlight", created: 3, text: "Druhý" }] },
    });
    await page.getByRole("button", { name: "Zápisník citátů", exact: true }).click();
    await expect(page.locator("main").getByText("2 řádky", { exact: true })).toBeVisible();
  });
});

test.describe("the bookcase that knows what's being read", () => {
  test("the reading pile can be put away, and the book stands on its shelf again", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await change(page, { "Salt and Ink": { status: "reading", opened: 5, progress: 0.4 } });
    await page.keyboard.press("Escape");
    await bookcase(page);
    const salt = page.locator("main .group[draggable=true]").filter({ hasText: "Salt and Ink" });
    const lying = () => salt.evaluate((el) => el.getBoundingClientRect().width > el.getBoundingClientRect().height);
    await expect.poll(lying).toBe(true);
    await page.getByLabel("Bookcase", { exact: true }).click();
    await page.getByRole("switch", { name: "Reading pile" }).click();
    await page.keyboard.press("Escape");
    await expect.poll(lying).toBe(false);
    await expect(salt).toHaveCount(1);
  });

  test("rainbow order is only offered when spines have colours to run through", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add();
    await page.keyboard.press("Escape");
    await bookcase(page);
    await page.getByLabel("Bookcase", { exact: true }).click();
    await expect(page.getByRole("switch", { name: "Rainbow order" })).toBeVisible();
    await page.getByRole("radio", { name: "Ink" }).click();
    await expect(page.getByRole("switch", { name: "Rainbow order" })).toHaveCount(0);
    await page.getByRole("radio", { name: "Cover colour" }).click();
    await expect(page.getByRole("switch", { name: "Rainbow order" })).toBeVisible();
  });

  test("box sets stand together, and can be turned off from the bookcase's options", async ({ shelf }) => {
    const { page } = shelf;
    await shelf.add([{ title: "Alpha", author: "A", series: "Set" }, { title: "Beta Is A Much Longer Title", author: "A", series: "Set" }, { title: "Loose", author: "B" }]);
    await change(page, { Alpha: { seriesIndex: 1, pages: 90 }, "Beta Is A Much Longer Title": { seriesIndex: 2, pages: 900 } });
    await page.keyboard.press("Escape");
    await bookcase(page);
    const heights = () =>
      page.locator("main .group[draggable=true]").evaluateAll((els) => [...new Set(els.filter((el) => /Alpha|Beta/.test(el.textContent ?? "")).map((el) => Math.round(el.getBoundingClientRect().height)))].length);
    await expect.poll(heights).toBe(1);
    await page.getByLabel("Bookcase", { exact: true }).click();
    await page.getByRole("switch", { name: "Box sets" }).click();
    await expect(page.getByRole("switch", { name: "Box sets" })).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");
    await expect(page.locator("main .group[draggable=true]")).toHaveCount(3);
  });
});

test("what's new opens the changelog on the website", async ({ shelf }) => {
  const { page } = shelf;
  const opened = await catchLinks(shelf);
  await shelf.add();
  await openSettings(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "About Shelfed", exact: true }).click();
  await dialog.getByRole("button", { name: "What's new" }).click();
  await expect.poll(opened).toEqual(["https://shelfed.simonveprek.cz/changelog/"]);
});
