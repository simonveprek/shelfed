/*
 * The site's posters as WebP, at the sizes phones and screens ask for, made
 * from the JPG first frames that record.mjs leaves in site/public/media.
 * Run after recording: node scripts/posters.mjs
 * Chromium does the encoding, since ffmpeg often comes without WebP.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const dir = resolve(import.meta.dirname, "../site/public/media");
const clips = ["views", "bookcase", "reader", "kindle-plug", "kindle-drop", "icons"];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const clip of clips) {
  const src = `data:image/jpeg;base64,${readFileSync(join(dir, `${clip}.jpg`)).toString("base64")}`;
  for (const width of [640, 960, 1280]) {
    const data = await page.evaluate(
      async ({ src, width }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = Math.round((img.height * width) / img.width);
        const g = canvas.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/webp", 0.78).split(",")[1];
      },
      { src, width },
    );
    writeFileSync(join(dir, width === 1280 ? `${clip}.webp` : `${clip}-${width}.webp`), Buffer.from(data, "base64"));
  }
  console.log(clip);
}
await browser.close();
