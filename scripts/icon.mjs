// Renders build/icon.svg to build/icon.png at 1024 pixels, with Electron's own
// Chromium, so no image tools are needed. Run with: npx electron scripts/icon.mjs
import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
app.whenReady().then(async () => {
  const svg = readFileSync(join(root, "build/icon.svg"), "utf8");
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  win.webContents.setZoomFactor(1);
  await win.loadURL(`data:text/html,${encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg width="1024" height="1024" ')}</body></html>`)}`);
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  writeFileSync(join(root, "build/icon.png"), image.resize({ width: 1024, height: 1024 }).toPNG());
  app.quit();
});
