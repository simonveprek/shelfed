import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import { card, expect, test, type Shelf } from "./shelf";
import { SAMPLE, sampleBook } from "../test/pdf-maker";

/*
 * A PDF made into an EPUB: a small book written as a PDF, with running heads,
 * page numbers, headings, bookmarks, two columns and a picture, handed to
 * Shelfed and looked over before the EPUB is made.
 */

/** Hands Shelfed the sample book's PDF, which opens it, then goes back to the library. */
async function handPdf(shelf: Shelf, data = sampleBook()) {
  const path = join(mkdtempSync(join(tmpdir(), "shelf-pdf-")), "The Salt Road.pdf");
  writeFileSync(path, data);
  await shelf.app.evaluate(({ BrowserWindow }, file) => BrowserWindow.getAllWindows()[0].webContents.send("open-files", [file]), path);
  await expect(shelf.page.getByRole("button", { name: /^(Back to the library|Zpět do knihovny)$/ })).toBeVisible({ timeout: 20_000 });
  await shelf.page.getByRole("button", { name: /^(Back to the library|Zpět do knihovny)$/ }).click();
  await expect(card(shelf.page, SAMPLE.title)).toBeVisible();
}

const editor = (page: Page) => page.getByRole("dialog", { name: "Make an EPUB from this PDF" });

async function openEditor(page: Page) {
  await card(page, SAMPLE.title).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Make an EPUB from this PDF" }).click();
  await expect(editor(page).getByText("3 chapters", { exact: true })).toBeVisible({ timeout: 20_000 });
  return editor(page);
}

/** The EPUB Shelfed made, opened up: its files by name. */
async function madeEpub(page: Page) {
  const bytes = await page.evaluate(async (title) => {
    const { books } = (await window.shelf.call("boot")) as { books: Array<{ id: string; title: string; formats: Array<{ ext: string }> }> };
    const book = books.find((b) => b.title === title)!;
    if (!book.formats.some((f) => f.ext === "epub")) return null;
    return [...new Uint8Array(await (await fetch(`shelf://file/${book.id}/epub`)).arrayBuffer())];
  }, SAMPLE.title);
  if (!bytes) return null;
  return unzipSync(new Uint8Array(bytes));
}

const chapterNames = (dialog: ReturnType<typeof editor>) => dialog.getByRole("textbox", { name: /^Name of chapter/ });

test.describe("making an EPUB from a PDF", () => {
  test("finds the chapters, leaves out what every page repeats, and shows each chapter as it'll read", async ({ shelf }) => {
    const { page } = shelf;
    await handPdf(shelf);
    const dialog = await openEditor(page);
    await expect(chapterNames(dialog)).toHaveCount(3);
    expect(await chapterNames(dialog).evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value))).toEqual([SAMPLE.title, "Chapter One", "Chapter Two"]);
    await chapterNames(dialog).nth(1).click();
    const preview = dialog.getByRole("region", { name: "Preview" });
    await expect(preview.getByText(SAMPLE.one)).toBeVisible();
    await expect(preview.getByText(SAMPLE.two)).toBeVisible();
    await expect(preview.getByText("THE SALT ROAD")).toHaveCount(0);
    // The two columns in order, and the picture cut from its page.
    await expect(preview.getByText(SAMPLE.left)).toBeVisible();
    await expect(preview.getByText(SAMPLE.right)).toBeVisible();
    const picture = preview.getByRole("img", { name: "Picture from page 3" });
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth).catch(() => 0)).toBeGreaterThan(100);
    // Put the running heads back, and they show; leave them out again.
    await dialog.getByRole("switch", { name: "Leave out running heads and page numbers" }).click();
    await chapterNames(dialog).nth(1).click();
    await expect(preview.getByText("THE SALT ROAD", { exact: false }).first()).toBeVisible();
    await dialog.getByRole("switch", { name: "Leave out running heads and page numbers" }).click();
    await expect(dialog.getByText("10 lines left out")).toBeVisible();
  });

  test("makes the EPUB with the chapters kept, under the names given, with the picture in it", async ({ shelf }) => {
    const { page } = shelf;
    await handPdf(shelf);
    const dialog = await openEditor(page);
    // The box is drawn over a hidden checkbox, as the kit does.
    const keep = dialog.getByRole("checkbox", { name: `Keep ${SAMPLE.title}` });
    await keep.dispatchEvent("click");
    await expect(keep).not.toBeChecked();
    await chapterNames(dialog).nth(2).fill("The Harbour");
    await expect(dialog.getByText("2 chapters go into the EPUB")).toBeVisible();
    await dialog.getByRole("button", { name: "Make EPUB" }).click();
    await expect(page.getByText(`${SAMPLE.title} is now EPUB too`)).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toHaveCount(0);

    const epub = (await madeEpub(page))!;
    const nav = strFromU8(epub["OEBPS/nav.xhtml"]);
    expect(nav).toContain("Chapter One");
    expect(nav).toContain("The Harbour");
    expect(nav).not.toContain(">The Salt Road<");
    const chapters = Object.keys(epub).filter((name) => name.startsWith("OEBPS/text/")).map((name) => strFromU8(epub[name])).join("\n");
    expect(chapters).toContain(SAMPLE.one);
    expect(chapters).toContain(SAMPLE.five);
    expect(chapters).not.toContain("THE SALT ROAD");
    expect(chapters).toContain("kept in <i>pencil</i> and checked");
    expect(Object.keys(epub).some((name) => /^OEBPS\/images\/page3-\d+\.jpg$/.test(name))).toBe(true);
  });

  test("chapters can begin every few pages, and only some pages taken", async ({ shelf }) => {
    const { page } = shelf;
    await handPdf(shelf);
    const dialog = await openEditor(page);
    await dialog.getByRole("radio", { name: "Pages" }).click();
    await dialog.getByRole("spinbutton", { name: "Pages in each" }).fill("2");
    await expect(dialog.getByText("3 chapters", { exact: true })).toBeVisible();
    expect(await chapterNames(dialog).evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value))).toEqual(["Pages 1 to 2", "Pages 3 to 4", "Pages 5 to 6"]);
    await dialog.getByRole("spinbutton", { name: "From page" }).fill("5");
    await expect(chapterNames(dialog)).toHaveCount(1);
    await expect(dialog.getByRole("region", { name: "Preview" }).getByText(SAMPLE.three)).toBeVisible();
    await expect(dialog.getByRole("region", { name: "Preview" }).getByText(SAMPLE.one)).toHaveCount(0);
    // From page 5 there's only one bookmark left, too few to make chapters from, so they aren't offered.
    await expect(dialog.getByRole("radio", { name: "Bookmarks" })).toHaveCount(0);
    await dialog.getByRole("spinbutton", { name: "From page" }).fill("1");
    await dialog.getByRole("radio", { name: "Bookmarks" }).click();
    expect(await chapterNames(dialog).evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value))).toEqual([SAMPLE.title, "Chapter One", "Chapter Two"]);
  });

  test("Convert offers to look a PDF over before making its EPUB", async ({ shelf }) => {
    const { page } = shelf;
    await handPdf(shelf);
    await card(page, SAMPLE.title).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Convert" }).click();
    const convert = page.getByRole("dialog", { name: "Convert" });
    await convert.getByText("EPUB", { exact: true }).click();
    await expect(convert.getByText("From a PDF, Shelfed shows you what it found first", { exact: false })).toBeVisible();
    await convert.getByRole("button", { name: "Look it over" }).click();
    await expect(editor(page).getByText("3 chapters", { exact: true })).toBeVisible({ timeout: 20_000 });
    await editor(page).getByRole("button", { name: "Cancel" }).click();
    await expect(editor(page)).toHaveCount(0);
    expect(await madeEpub(page)).toBeNull();
  });

  test("other formats made from a PDF get its chapters too", async ({ shelf }) => {
    const { page } = shelf;
    await handPdf(shelf);
    await card(page, SAMPLE.title).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Convert" }).click();
    const convert = page.getByRole("dialog", { name: "Convert" });
    await convert.getByText("Web page", { exact: true }).click();
    await convert.getByRole("button", { name: /^Make/ }).click();
    await expect(page.getByText(`${SAMPLE.title} is now HTML too`)).toBeVisible({ timeout: 30_000 });
    const html = await page.evaluate(async (title) => {
      const { books } = (await window.shelf.call("boot")) as { books: Array<{ id: string; title: string }> };
      return (await fetch(`shelf://file/${books.find((b) => b.title === title)!.id}/html`)).text();
    }, SAMPLE.title);
    expect(html).toContain("Chapter One");
    expect(html).toContain(SAMPLE.one);
    expect(html).not.toContain("THE SALT ROAD");
  });
});

test.describe("making an EPUB from a PDF, in Czech", () => {
  test.use({ language: "cs" });

  test("speaks Czech, counting the Czech way", async ({ shelf }) => {
    const { page } = shelf;
    await handPdf(shelf);
    await card(page, SAMPLE.title).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Vytvořit z tohoto PDF EPUB" }).click();
    const dialog = page.getByRole("dialog", { name: "Vytvořit z tohoto PDF EPUB" });
    await expect(dialog.getByText("3 kapitoly", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText("Vynechat záhlaví, zápatí a čísla stran")).toBeVisible();
    await expect(dialog.getByText("Do EPUB půjdou 3 kapitoly")).toBeVisible();
  });
});
