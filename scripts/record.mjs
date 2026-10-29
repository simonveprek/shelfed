// Records the demo videos and GIFs for the README and the website, by playing
// each scene in the real app and filming its window with Playwright.
//
//   npm run build && node scripts/record.mjs [scene ...]
//
// It works on a copy of a library, ~/Documents/Shelf Library unless
// SHELF_DEMO_LIBRARY says otherwise. SHELF_DEMO_SKIP leaves books out by
// title, separated by |, so only books free to show end up in public. Needs ffmpeg.
import { _electron as electron } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
mkdirSync(join(root, "site/public/media"), { recursive: true });
const OUT = { docs: join(root, "docs/media"), site: join(root, "site/public/media") };
const WINDOW = { width: 1280, height: 800 };
const CANVAS = { width: 1440, height: 920 };
const source = process.env.SHELF_DEMO_LIBRARY ?? join(homedir(), "Documents/Shelf Library");
const skip = (process.env.SHELF_DEMO_SKIP ?? "").split("|").filter(Boolean);
const work = mkdtempSync(join(tmpdir(), "shelf-record-"));
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/* ------------------------------------------------------------------------ */
/* The library and the frame                                                 */
/* ------------------------------------------------------------------------ */

// A copy of the library, without the books left out.
const library = join(work, "Library");
cpSync(source, library, { recursive: true });
{
  const file = join(library, "library.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  const out = data.books.filter((b) => skip.some((title) => b.title.includes(title)));
  for (const book of out) rmSync(join(library, book.dir), { recursive: true, force: true });
  data.books = data.books.filter((b) => !out.includes(b));
  writeFileSync(file, JSON.stringify(data));
}

const frame = join(work, "frame");
mkdirSync(frame);
execFileSync("npx", ["electron", join(root, "scripts/frame.mjs"), frame, CANVAS.width, CANVAS.height, WINDOW.width, WINDOW.height].map(String), { cwd: root, stdio: "inherit" });
const place = JSON.parse(readFileSync(join(frame, "place.json"), "utf8"));

/* ------------------------------------------------------------------------ */
/* Scenes                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Starts Shelf on the library in its own profile, dark, films it while the
 * scene plays, then frames it into an MP4, a GIF and a poster.
 */
async function scene(name, play, { settings = {}, kindle = false } = {}) {
  const data = join(work, `profile-${name}`);
  mkdirSync(data, { recursive: true });
  writeFileSync(
    join(data, "settings.json"),
    JSON.stringify({
      libraryPath: library,
      onboarded: true,
      inspector: true,
      sidebar: true,
      updates: false,
      view: "grid",
      kindle: { to: "", from: "", host: "", port: 465, secure: true, user: "", format: "epub", model: "pw5", finish: "agave", picked: true },
      bookcase: { group: "none", material: "walnut", spines: "cover", fit: true, authors: true, ribbons: true, lean: true, ribbon: "accent" },
      ...settings,
    }),
  );
  writeFileSync(join(data, "window.json"), JSON.stringify({ x: 40, y: 40, ...WINDOW }));
  const drive = join(work, `kindle-${name}`);
  mkdirSync(drive, { recursive: true });

  const app = await electron.launch({
    args: ["."],
    cwd: root,
    env: { ...process.env, SHELF_USERDATA: data, ...(kindle ? { SHELF_DEMO_KINDLE: drive } : {}) },
  });
  const page = await app.firstWindow();
  // Dark, the way it looks best in a README, once the page is there to ask.
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(settings.onboarded === false ? 300 : 2200);

  const stop = await film(page);
  await play({ page, app, drive });
  const frames = await stop();
  await app.close();
  render(name, frames);
}

/**
 * Films the window through the DevTools screencast, a frame each time it
 * paints. (Playwright's own video stops Electron from loading its page.)
 */
async function film(page) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ data, at: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: WINDOW.width, maxHeight: WINDOW.height });
  return async () => {
    const end = Date.now() / 1000;
    await cdp.send("Page.stopScreencast");
    return { frames, end };
  };
}

/** The frames as a list ffmpeg plays at their real pace, each held until the next. */
function timeline(name, { frames, end }) {
  const dir = join(work, `frames-${name}`);
  mkdirSync(dir, { recursive: true });
  const lines = [];
  frames.forEach((frame, i) => {
    const file = join(dir, `${String(i).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    const next = frames[i + 1]?.at ?? end;
    lines.push(`file '${file}'`, `duration ${Math.max(0.001, next - frame.at).toFixed(4)}`);
  });
  // The last frame once more, as the concat format wants.
  lines.push(`file '${join(dir, `${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`);
  const list = join(dir, "list.txt");
  writeFileSync(list, lines.join("\n"));
  return list;
}

/**
 * The window as a plain MP4 and poster for the website, which frames it
 * itself, and framed in the backdrop as a GIF for the README.
 */
function render(name, film) {
  const length = (film.end - film.frames[0].at).toFixed(2);
  const list = timeline(name, film);
  const mp4 = join(OUT.site, `${name}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-t", length,
    "-vf", `fps=30,scale=${WINDOW.width}:${WINDOW.height}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-movflags", "+faststart", "-an", mp4,
  ]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-frames:v", "1", "-q:v", "3", join(OUT.site, `${name}.jpg`)]);
  const framed = join(work, `${name}-framed.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-loop", "1", "-t", length, "-i", join(frame, "backdrop.png"),
    "-i", mp4,
    "-loop", "1", "-t", length, "-i", join(frame, "mask.png"),
    "-loop", "1", "-t", length, "-i", join(frame, "rim.png"),
    "-filter_complex",
    `[1:v]format=rgba[app];[2:v]format=gray,scale=${WINDOW.width}:${WINDOW.height}[mask];[app][mask]alphamerge[window];[0:v]format=rgba[bg];` +
      `[bg][window]overlay=${place.x}:${place.y}:shortest=1[framed];[framed][3:v]overlay=0:0:shortest=1,format=yuv420p`,
    "-c:v", "libx264", "-crf", "18", "-t", length, framed,
  ]);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", framed,
    "-filter_complex", "fps=18,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=220[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle",
    join(OUT.docs, `${name}.gif`),
  ]);
  console.log(`Recorded ${name}, ${length} s`);
}

const card = (page, title) => page.locator("main [draggable=true]").filter({ hasText: title }).first();

/** Sweeps the pointer across, so the bookcase leans after it. */
async function sweep(page, steps = 40) {
  await page.mouse.move(380, 420);
  await page.mouse.move(900, 380, { steps });
  await page.mouse.move(640, 430, { steps: Math.round(steps / 2) });
}

const SCENES = {
  // Covers, a list, shelves and the bookcase, each sliding in.
  views: () =>
    scene("views", async ({ page }) => {
      for (const view of ["List", "Shelves", "Bookcase in 3D"]) {
        await wait(1500);
        await page.getByRole("radio", { name: view }).click();
      }
      await wait(1200);
      await sweep(page);
      await wait(800);
    }),

  // The bookcase in oak, slate and walnut.
  bookcase: () =>
    scene(
      "bookcase",
      async ({ page }) => {
        await wait(900);
        await page.getByLabel("Bookcase", { exact: true }).click();
        for (const wood of ["Oak", "Slate", "Walnut"]) {
          await wait(1200);
          await page.getByRole("dialog").getByText(wood, { exact: true }).click();
        }
        await wait(900);
        await page.keyboard.press("Escape");
        await sweep(page);
        await wait(700);
      },
      { settings: { view: "bookcase" } },
    ),

  // A Kindle plugged in: it rises, the plug goes in, the edges light up.
  "kindle-plug": () =>
    scene("kindle-plug", async ({ app, drive }) => {
      await wait(600);
      await app.evaluate((_, folder) => {
        process.env.SHELF_DEMO_KINDLE = folder;
      }, drive);
      // Found on the next look for Kindles, then the welcome plays out.
      await wait(7200);
    }),

  // A book dragged onto the Kindle, copied across by cable.
  "kindle-drop": () =>
    scene(
      "kindle-drop",
      async ({ page }) => {
        await wait(900);
        // Playwright's mouse doesn't start a real drag in Electron, so the same
        // events a drag sends are sent here, carrying the book along.
        await page.evaluate(async () => {
          const pause = (ms) => new Promise((done) => setTimeout(done, ms));
          const book = [...document.querySelectorAll("main [draggable=true]")].find((el) => el.textContent?.includes("The Great Gatsby"));
          const dock = [...document.querySelectorAll("aside h3")].find((h) => h.textContent === "Your Kindle")?.parentElement;
          if (!book || !dock) throw new Error("No book or no Kindle to drop it on");
          const data = new DataTransfer();
          const at = (el, y = 0.5) => {
            const box = el.getBoundingClientRect();
            return { clientX: box.left + box.width / 2, clientY: box.top + box.height * y };
          };
          book.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data, ...at(book) }));
          await pause(1300);
          const device = dock.querySelector("div") ?? dock;
          dock.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: data, ...at(device, 0.4) }));
          for (let i = 0; i < 8; i++) {
            dock.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data, ...at(device, 0.4) }));
            await pause(70);
          }
          dock.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data, ...at(device, 0.4) }));
          book.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }));
        });
        await wait(4500);
      },
      { kindle: true },
    ),

  // Reading Pride and Prejudice, a few pages in.
  reader: () =>
    scene("reader", async ({ page }) => {
      await card(page, "Pride and Prejudice").dblclick();
      await wait(2200);
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("ArrowRight");
        await wait(1100);
      }
      await page.keyboard.press("Escape");
      await wait(1200);
    }),

  // The opening, a page at a time.
  onboarding: () =>
    scene(
      "onboarding",
      async ({ page }) => {
        for (let i = 0; i < 4; i++) {
          await wait(2400);
          await page.mouse.click(640, 400);
        }
        await wait(2200);
      },
      { settings: { onboarded: false } },
    ),

  // The app icons, one after another.
  icons: () =>
    scene("icons", async ({ page }) => {
      await page.getByLabel("Add books", { exact: true }).click();
      await page.getByRole("menuitem", { name: "Settings" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Appearance", exact: true }).click();
      await wait(900);
      for (const icon of ["Nebula", "Spectrum", "Foil", "Candy", "Lux", "Zen", "Sky", "Paper"]) {
        await page.getByRole("button", { name: icon, exact: true }).click();
        await wait(650);
      }
      await wait(500);
    }),
};

const wanted = process.argv.slice(2);
for (const [name, record] of Object.entries(SCENES)) if (!wanted.length || wanted.includes(name)) await record();
rmSync(work, { recursive: true, force: true });
