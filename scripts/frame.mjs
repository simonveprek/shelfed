// Draws the frame the demo recordings sit in: a dark backdrop with a little
// aurora and the window's shadow, the window's rounded corners as a mask, and a
// hairline rim. Run by scripts/record.mjs with Electron's own Chromium:
//   npx electron scripts/frame.mjs <out folder> <canvas w> <canvas h> <window w> <window h>
import { app, BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, cw, ch, ww, wh] = process.argv.slice(2).map((v, i) => (i ? Number(v) : v));
const x = (cw - ww) / 2;
const y = Math.round((ch - wh) * 0.42);
const r = 12;

const pages = {
  "backdrop.png": `<body style="margin:0;width:${cw}px;height:${ch}px;overflow:hidden;background:
      radial-gradient(60% 70% at 12% 8%, rgb(43 75 255 / 0.20), transparent 70%),
      radial-gradient(55% 65% at 92% 96%, rgb(255 45 85 / 0.16), transparent 70%),
      radial-gradient(45% 55% at 70% 10%, rgb(162 59 255 / 0.12), transparent 70%),
      linear-gradient(160deg, #15141b, #0a0a0d)">
    <div style="position:absolute;left:${x}px;top:${y}px;width:${ww}px;height:${wh}px;border-radius:${r}px;background:#000;
      box-shadow:0 40px 90px rgb(0 0 0 / 0.55), 0 12px 30px rgb(0 0 0 / 0.4)"></div></body>`,
  "mask.png": `<body style="margin:0;width:${ww}px;height:${wh}px;background:#000">
    <div style="width:${ww}px;height:${wh}px;border-radius:${r}px;background:#fff"></div></body>`,
  "rim.png": `<body style="margin:0;width:${cw}px;height:${ch}px;background:transparent">
    <div style="position:absolute;left:${x}px;top:${y}px;width:${ww}px;height:${wh}px;border-radius:${r}px;box-sizing:border-box;
      border:1px solid rgb(255 255 255 / 0.12)"></div></body>`,
};

app.whenReady().then(async () => {
  // One window for all three, sized to each in turn.
  const win = new BrowserWindow({ width: cw, height: ch, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  for (const [name, html] of Object.entries(pages)) {
    const [w, h] = name === "mask.png" ? [ww, wh] : [cw, ch];
    win.setContentSize(w, h);
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((done) => setTimeout(done, 250));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
    writeFileSync(join(dir, name), image.resize({ width: w, height: h }).toPNG());
  }
  // Where the window goes, for the recording to be placed over the backdrop.
  writeFileSync(join(dir, "place.json"), JSON.stringify({ x, y }));
  app.quit();
});
