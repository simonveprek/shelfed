import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ElectronApplication, Frame, Page } from "@playwright/test";
import { card, expect, test } from "./shelf";

/*
 * Looking up a word while reading. A folder of answers stands in for
 * Wiktionary and Wikipedia, so nothing here goes online.
 */

/** The book's page, which the reader shows in a frame of its own. */
async function bookFrame(page: Page) {
  let found: Frame | undefined;
  await expect
    .poll(async () => {
      for (const frame of page.frames()) if (await frame.evaluate(() => document.body?.innerText.includes("The tide came in")).catch(() => false)) found = frame;
      return Boolean(found);
    })
    .toBe(true);
  return found!;
}

/** Selects words on the book's page, the way a reader's pointer would. */
async function select(page: Page, words: string) {
  const frame = await bookFrame(page);
  await frame.evaluate((words) => {
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

/**
 * Selects words and clicks a button on the bar over them. A book still
 * laying out its first page as it opens moves, which puts the bar away, so on
 * a slow machine it selects again until the page has settled.
 */
async function pick(page: Page, words: string, button: string) {
  await expect(async () => {
    await select(page, words);
    await page.getByRole("button", { name: button, exact: true }).click({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

/** Writes Wiktionary's answer for a word, or Wikipedia's for a title in a language. */
function answer(folder: string, where: "wiktionary" | ["wikipedia", string], word: string, body: unknown) {
  const dir = where === "wiktionary" ? join(folder, "wiktionary") : join(folder, "wikipedia", where[1]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${encodeURIComponent(word)}.json`), typeof body === "string" ? body : JSON.stringify(body));
}

/** Keeps links the app opens in the browser from opening, and gives back the ones it tried. */
async function catchLinks(app: ElectronApplication) {
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as { opened?: string[] }).opened = opened;
    shell.openExternal = async (url: string) => void opened.push(url);
  });
  return () => app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []);
}

const GULLS = '<span class="form-of-definition use-with-mention">plural of <span class="form-of-definition-link"><i><a rel="mw:WikiLink" href="/wiki/gull#English" title="gull">gull</a></i></span></span>';
const GULL = { en: [{ partOfSpeech: "Noun", language: "English", definitions: [{ definition: "A seabird of the family <i>Laridae</i>.<script>window.hacked = 1</script>" }] }] };

async function openBook(page: Page) {
  await card(page, "The Lighthouse Keeper").dblclick();
  await expect(page.getByRole("button", { name: /^(Next page|Další strana)$/ })).toBeVisible();
}

test.describe("looking up a word", () => {
  test("says what a word means, from the word it comes from, and Escape closes only the card", async ({ shelf }) => {
    const { page } = shelf;
    answer(shelf.lookup, "wiktionary", "gulls", { en: [{ partOfSpeech: "Noun", language: "English", definitions: [{ definition: GULLS }] }] });
    answer(shelf.lookup, "wiktionary", "gull", GULL);
    await shelf.add();
    await openBook(page);
    await pick(page, "gulls", "Look up");
    const looked = page.getByRole("dialog", { name: "Look up" });
    await expect(looked.getByText("A seabird of the family Laridae.")).toBeVisible();
    await expect(looked.getByText("“gulls” is a form of “gull”")).toBeVisible();
    await expect(looked.getByText("Noun · English")).toBeVisible();
    expect(await page.evaluate(() => "hacked" in window)).toBe(false);
    await page.keyboard.press("Escape");
    await expect(looked).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();

    // A word nobody has says so, and a long selection isn't offered at all.
    await pick(page, "flats", "Look up");
    await expect(page.getByText("Nothing found for “flats”.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(async () => {
      await select(page, "The tide came in slowly over");
      await expect(page.getByRole("button", { name: "Note", exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Look up" })).toHaveCount(0);
  });

  test("a word Wiktionary hasn't got gets what Wikipedia says, and More opens it in the browser", async ({ shelf }) => {
    const { page, app } = shelf;
    answer(shelf.lookup, ["wikipedia", "en"], "lamp", {
      type: "standard",
      title: "Lamp",
      extract: "A lamp is a device that produces light.",
      content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Lamp" } },
    });
    const opened = await catchLinks(app);
    await shelf.add();
    await openBook(page);
    await pick(page, "lamp", "Look up");
    const looked = page.getByRole("dialog", { name: "Look up" });
    await expect(looked.getByText("A lamp is a device that produces light.")).toBeVisible();
    await expect(looked.getByText("From Wikipedia")).toBeVisible();
    await looked.getByRole("button", { name: "More" }).click();
    await expect.poll(opened).toEqual(["https://en.wikipedia.org/wiki/Lamp"]);
  });

  test("says plainly when it can't ask anyone, and the book stays open", async ({ shelf }) => {
    const { page } = shelf;
    // A broken answer stands for not being able to reach either.
    answer(shelf.lookup, "wiktionary", "ship", "not an answer");
    answer(shelf.lookup, ["wikipedia", "en"], "ship", "not an answer");
    await shelf.add();
    await openBook(page);
    await pick(page, "ship", "Look up");
    await expect(page.getByText("Shelfed couldn't look that up. Check you're online, and try again.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Look up" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
  });

  test("a click beside the card closes it, and the page stays where it was", async ({ shelf }) => {
    const { page } = shelf;
    answer(shelf.lookup, "wiktionary", "gull", GULL);
    await shelf.add();
    await openBook(page);
    const where = await page.getByRole("slider").last().getAttribute("aria-valuenow");
    await pick(page, "gull", "Look up");
    await expect(page.getByText("A seabird of the family Laridae.")).toBeVisible();
    await page.mouse.click(20, 300);
    await expect(page.getByRole("dialog", { name: "Look up" })).toHaveCount(0);
    expect(await page.getByRole("slider").last().getAttribute("aria-valuenow")).toBe(where);
  });

  test("looking up again shows the new word, not the old one", async ({ shelf }) => {
    const { page } = shelf;
    answer(shelf.lookup, "wiktionary", "gull", GULL);
    answer(shelf.lookup, "wiktionary", "log", { en: [{ partOfSpeech: "Noun", language: "English", definitions: [{ definition: "A record of a ship's voyage." }] }] });
    await shelf.add();
    await openBook(page);
    await pick(page, "gull", "Look up");
    await expect(page.getByText("A seabird of the family Laridae.")).toBeVisible();
    await page.keyboard.press("Escape");
    await pick(page, "log", "Look up");
    await expect(page.getByText("A record of a ship's voyage.")).toBeVisible();
    await expect(page.getByText("A seabird of the family Laridae.")).toHaveCount(0);
  });
});

test.describe("looking up a word, in Czech", () => {
  test.use({ language: "cs" });

  test("names the kind of word and its language in Czech, and says where the meanings come from", async ({ shelf }) => {
    const { page } = shelf;
    answer(shelf.lookup, "wiktionary", "gulls", { en: [{ partOfSpeech: "Noun", language: "English", definitions: [{ definition: GULLS }] }] });
    answer(shelf.lookup, "wiktionary", "gull", GULL);
    await shelf.add();
    await openBook(page);
    await pick(page, "gulls", "Vyhledat význam");
    const looked = page.getByRole("dialog", { name: "Vyhledat význam" });
    await expect(looked.getByText("Podstatné jméno · Angličtina")).toBeVisible();
    await expect(looked.getByText("„gulls“ je tvar slova „gull“")).toBeVisible();
    await expect(looked.getByText("Významy z anglického Wikislovníku.")).toBeVisible();
    await expect(looked.getByRole("button", { name: "Více" })).toBeVisible();
  });
});
