import {
  app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, screen, session, shell,
  type MenuItemConstructorOptions,
} from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Book, BootState, Collection, MetadataCandidate, Settings } from "../shared/types";
import { KINDLE_EMAIL, READABLE } from "../shared/types";
import { calibreConvert, docxToHtml, findCalibre, htmlToPdf, tempPath } from "./convert";
import { copyToDevice, findDevices, kindlePort, kindlesOnUsb, readClippings, SMTP_PRESETS, sendToKindle, verifyMail } from "./kindle";
import { Library } from "./library";
import { fetchBytes, searchGoogle, searchOpenLibrary } from "./metadata";
import { downloadBook, forgetDownload, freeBooks } from "./catalogues";
import { getSettings, setSettings, setSmtpPassword } from "./settings";

const here = fileURLToPath(new URL(".", import.meta.url));
const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

// The kit's background, so the window never flashes another colour.
const PAPER = { light: "#f6f5f1", dark: "#111111", inkLight: "#1d1b18", inkDark: "#ededed" };

protocol.registerSchemesAsPrivileged([
  { scheme: "shelf", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// A separate profile for development and tests, so they never touch a real library.
if (process.env.SHELF_USERDATA) app.setPath("userData", process.env.SHELF_USERDATA);

// A second copy hands its files to the first and leaves at once. quit() would
// let it carry on starting up, opening the same library alongside.
const primary = app.requestSingleInstanceLock();
if (!primary) app.exit(0);

// Windows groups the window with a pinned taskbar icon by this id.
if (process.platform === "win32") app.setAppUserModelId("cz.simonveprek.shelf");

let win: BrowserWindow | null = null;
let library: Library;
/** Files the system asked us to open before the window was ready. */
const queued: string[] = [];
/** True once the window's page can take files. */
let listening = false;

/* ------------------------------------------------------------------------ */
/* Window                                                                    */
/* ------------------------------------------------------------------------ */

const stateFile = () => join(app.getPath("userData"), "window.json");

function savedBounds() {
  try {
    const b = JSON.parse(readFileSync(stateFile(), "utf8"));
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y);
    return visible ? b : null;
  } catch {
    return null;
  }
}

function createWindow() {
  const bounds = savedBounds();
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: bounds?.width ?? 1320,
    height: bounds?.height ?? 840,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 780,
    minHeight: 540,
    show: false,
    title: "Shelf",
    backgroundColor: dark ? PAPER.dark : PAPER.light,
    ...(isMac
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 20, y: 22 } }
      : {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: { color: dark ? PAPER.dark : PAPER.light, symbolColor: dark ? PAPER.inkDark : PAPER.inkLight, height: 64 },
        }),
    // While developing, Windows and Linux show this in the title bar and task bar. Built, the app's own icon is used.
    ...(isMac || app.isPackaged ? {} : { icon: join(here, "../../build/icon.png") }),
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      spellcheck: false,
      // Scripted checks run in a window behind others, which must not be paused.
      backgroundThrottling: !process.env.SHELF_SHOT,
    },
  });
  if (bounds?.maximized) win.maximize();
  // Scripted checks open without taking focus, so they never catch someone's typing.
  win.once("ready-to-show", () => {
    if (process.env.SHELF_SHOT) console.log("[startup] window ready", Math.round(process.uptime() * 1000), "ms after launch");
    return process.env.SHELF_SHOT ? win?.showInactive() : win?.show();
  });
  win.on("close", () => {
    if (!win || win.isMinimized()) return;
    writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  });

  // Links open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // Only Shelf itself loads in the window. Any other file, dropped where nothing
  // takes it, would replace the whole app.
  const home = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(here, "../renderer/index.html")).href;
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(home)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  // If the page's process dies, bring it back rather than leave an empty window.
  win.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") win?.webContents.reload();
  });
  // In development, the page's errors show in the terminal too.
  if (!app.isPackaged && !process.env.SHELF_SHOT)
    win.webContents.on("console-message", (event) => event.level === "error" && console.log("[page error]", event.message));

  if (process.env.SHELF_SHOT) shoot(win);
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(here, "../renderer/index.html"));
  win.on("closed", () => (win = null));
}

/**
 * For development. Runs the steps in the SHELF_SHOT file, a JSON list of
 * [javascript, wait in ms, picture path], saving a picture after each, or
 * recording frames for the wait when the path is a folder ending in a slash.
 */
function shoot(target: BrowserWindow) {
  target.webContents.on("console-message", (event) => console.log("[page]", event.message));
  target.webContents.once("did-finish-load", async () => {
    const steps = JSON.parse(readFileSync(process.env.SHELF_SHOT!, "utf8")) as Array<[string, number, string?]>;
    for (const [js, wait, name] of steps) {
      try {
        // Memory across every process the app runs, for benchmarks.
        if (js === "__METRICS__") {
          const metrics = app.getAppMetrics();
          const kb = metrics.reduce((n, m) => n + m.memory.workingSetSize, 0);
          console.log("[metrics]", JSON.stringify({ processes: metrics.length, workingSetMB: Math.round(kb / 1024), byType: metrics.map((m) => [m.type, Math.round(m.memory.workingSetSize / 1024)]) }));
        } else if (js) console.log("[eval]", String(await target.webContents.executeJavaScript(js, true)).slice(0, 2000));
      } catch (error) {
        console.log("[eval failed]", js, error);
      }
      // A path ending in a slash records frames into that folder for the wait, for GIFs.
      if (name?.endsWith("/")) {
        await mkdir(name, { recursive: true });
        const start = Date.now();
        let frame = 0;
        while (Date.now() - start < wait) {
          const image = await target.webContents.capturePage();
          await writeFile(join(name, `f${String(frame++).padStart(4, "0")}.png`), image.resize({ width: Math.round(image.getSize().width / 2) }).toPNG());
        }
        console.log("[recorded]", JSON.stringify({ frames: frame, ms: Date.now() - start }));
        continue;
      }
      await new Promise((r) => setTimeout(r, wait));
      if (name) await writeFile(name, (await target.webContents.capturePage()).toPNG());
    }
    if (process.env.SHELF_QUIT) app.quit();
  });
}

const send = (channel: string, ...args: unknown[]) => win?.webContents.send(channel, ...args);

/* ------------------------------------------------------------------------ */
/* Files served to the window                                                */
/* ------------------------------------------------------------------------ */

function serve() {
  // shelf://thumb/<id>, shelf://cover/<id>, shelf://file/<id>/<ext>
  protocol.handle("shelf", async (request) => {
    const url = new URL(request.url);
    const [id, ext] = url.pathname.slice(1).split("/");
    const book = library.books.get(id);
    if (!book) return new Response("Not found", { status: 404 });
    let path: string;
    if (url.host === "thumb" || url.host === "cover") path = join(library.bookDir(book), `${url.host}.jpg`);
    else {
      try {
        path = library.filePath(book, ext);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
    if (!existsSync(path)) return new Response("Not found", { status: 404 });
    const res = await net.fetch(pathToFileURL(path).href);
    const headers = new Headers(res.headers);
    // Covers carry a version in their address, so they can be kept for good.
    if (url.host !== "file") headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return new Response(res.body, { status: res.status, headers });
  });
}

/* ------------------------------------------------------------------------ */
/* What the window can ask for                                               */
/* ------------------------------------------------------------------------ */

const boot = (): BootState => ({
  books: library.list(),
  collections: library.collections,
  settings: getSettings(),
  platform: process.platform,
  calibre: findCalibre(getSettings().calibrePath),
  version: app.getVersion(),
});

const api = {
  boot,

  async pickFiles() {
    const res = await dialog.showOpenDialog(win!, {
      title: "Add Books",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Books", extensions: ["epub", "mobi", "azw3", "azw", "pdf", "fb2", "fbz", "cbz", "txt", "md", "html", "htm", "docx", "prc"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    return res.canceled ? [] : res.filePaths;
  },

  async pickFolder(title = "Add a Folder of Books") {
    const res = await dialog.showOpenDialog(win!, { title, properties: ["openDirectory", "createDirectory"] });
    return res.canceled ? [] : res.filePaths;
  },

  async pickImage() {
    const res = await dialog.showOpenDialog(win!, {
      title: "Choose a Cover",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif", "avif"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return new Uint8Array(readFileSync(res.filePaths[0]));
  },

  collect: (paths: string[]) => library.collect(paths),
  importFile: (path: string) => library.importFile(path),
  update: (id: string, patch: Partial<Book>, relocate = false) => library.update(id, patch, relocate),
  setCover: (id: string, cover: Uint8Array, thumb: Uint8Array, tint?: string) => library.setCover(id, cover, thumb, tint),
  addFormat: (id: string, ext: string, data: Uint8Array) => library.addFormat(id, ext, data),
  removeFormat: (id: string, ext: string) => library.removeFormat(id, ext),
  merge: (from: string, into: string) => library.merge(from, into),
  remove: (ids: string[]) => library.remove(ids),
  restore: (ids: string[]) => library.restore(ids),
  saveCollections: (collections: Collection[]) => library.saveCollections(collections),

  reveal(id: string, ext?: string) {
    shell.showItemInFolder(library.filePath(library.get(id), ext));
  },

  revealLibrary() {
    shell.openPath(library.root);
  },

  openExternal(url: string) {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  },

  settings: (patch: Partial<Settings>) => setSettings(patch),

  async moveLibrary() {
    const [path] = await api.pickFolder("Choose Where Your Library Lives");
    if (!path) return null;
    await library.settle();
    setSettings({ libraryPath: path });
    library = await new Library(path).open();
    library.onSaveError = () => send("save-failed");
    return boot();
  },

  setPassword: (password: string) => setSmtpPassword(password),
  verifyMail: () => verifyMail(getSettings().kindle),
  smtpPreset: (email: string) => SMTP_PRESETS[email.split("@")[1]?.toLowerCase() ?? ""] ?? null,

  async pickCalibre() {
    const res = await dialog.showOpenDialog(win!, {
      title: "Find Calibre",
      properties: ["openFile"],
      ...(process.platform === "win32" ? { filters: [{ name: "Programs", extensions: ["exe"] }] } : {}),
    });
    let path = res.filePaths[0];
    if (!path) return null;
    if (path.endsWith(".app")) path = join(path, "Contents/MacOS/ebook-convert");
    // Picking calibre.exe itself means the converter next to it, not the app.
    if (/calibre(-portable)?\.exe$/i.test(path)) path = join(path, "..", "ebook-convert.exe");
    setSettings({ calibrePath: path });
    return findCalibre(path);
  },

  async calibreConvert(job: string, id: string, from: string, to: string) {
    const bin = findCalibre(getSettings().calibrePath);
    if (!bin) throw new Error("Calibre is not installed.");
    const book = library.get(id);
    const out = await tempPath(`book.${to}`);
    await calibreConvert(bin, library.filePath(book, from), out, (share, line) => send("progress", job, share, line));
    return library.addFormat(id, to, out);
  },

  async pdfFormat(id: string, html: string) {
    return library.addFormat(id, "pdf", await htmlToPdf(html, getSettings().pdfPage));
  },

  docxHtml: (id: string) => docxToHtml(library.filePath(library.get(id), "docx")),

  async sendMail(id: string, ext: string) {
    const book = library.get(id);
    if (!KINDLE_EMAIL.includes(ext)) throw new Error(`Amazon does not take ${ext.toUpperCase()} by email.`);
    const format = book.formats.find((f) => f.ext === ext)!;
    await sendToKindle(getSettings().kindle, library.filePath(book, ext), format.file, book.title);
  },

  devices: () => findDevices(),
  kindlePort: () => kindlePort(),
  kindles: () => kindlesOnUsb(),

  async copyToDevice(id: string, ext: string, device: string) {
    const book = library.get(id);
    const format = book.formats.find((f) => f.ext === ext)!;
    return copyToDevice(device, library.filePath(book, ext), format.file);
  },

  searchMetadata(source: "openlibrary" | "google", q: { title: string; author?: string; isbn?: string }): Promise<MetadataCandidate[]> {
    return source === "google" ? searchGoogle(q) : searchOpenLibrary(q);
  },

  download: (url: string) => {
    // Covers come from the web, never from the disk or anywhere else.
    if (!/^https:\/\//.test(url)) throw new Error("Only https addresses can be downloaded.");
    return fetchBytes(url);
  },

  logReading: (id: string, seconds: number) => library.logReading(id, seconds),

  /** My Clippings.txt from every Kindle plugged in. */
  clippings: () => readClippings(),

  async pickClippings() {
    const res = await dialog.showOpenDialog(win!, {
      title: "Choose My Clippings.txt",
      properties: ["openFile"],
      filters: [{ name: "Kindle clippings", extensions: ["txt"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return readFileSync(res.filePaths[0], "utf8");
  },

  freeBooks: (source: "standard" | "gutenberg", query: string) => freeBooks(source, query),
  downloadBook: (url: string, name: string) => downloadBook(url, name),
  forgetDownload: (path: string) => forgetDownload(path),

  /** The window's light or dark, so the title bar and backdrop follow it. */
  appearance(dark: boolean, color?: string, ink?: string) {
    if (!win) return;
    const bg = color ?? (dark ? PAPER.dark : PAPER.light);
    win.setBackgroundColor(bg);
    if (!isMac) win.setTitleBarOverlay({ color: bg, symbolColor: ink ?? (dark ? PAPER.inkDark : PAPER.inkLight), height: 64 });
  },

  ready() {
    listening = true;
    const files = queued.splice(0);
    if (files.length) send("open-files", files);
  },
};

export type Api = typeof api;

ipcMain.handle("shelf", async (event, method: keyof Api, ...args: unknown[]) => {
  try {
    // Only the app's own page may ask, never a frame inside it, and only for what the api offers.
    if (!win || event.senderFrame !== win.webContents.mainFrame) throw new Error("Not allowed");
    if (!Object.hasOwn(api, method)) throw new Error("Unknown request");
    const fn = api[method] as (...a: unknown[]) => unknown;
    return { ok: true, value: await fn(...args) };
  } catch (error) {
    // Errors cross the bridge as plain words, ready to show.
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

/* ------------------------------------------------------------------------ */
/* Menu                                                                      */
/* ------------------------------------------------------------------------ */

function buildMenu() {
  const cmd = (command: string) => () => send("command", command);
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: "Shelf",
          submenu: [
            { label: "About Shelf", role: "about" as const },
            { type: "separator" as const },
            { label: "Settings…", accelerator: "Cmd+,", click: cmd("settings") },
            { type: "separator" as const },
            { role: "hide" as const },
            { role: "hideOthers" as const },
            { role: "unhide" as const },
            { type: "separator" as const },
            { role: "quit" as const },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [
        { label: "Add Books…", accelerator: "CmdOrCtrl+O", click: cmd("import") },
        { label: "Add Folder…", accelerator: "CmdOrCtrl+Shift+O", click: cmd("import-folder") },
        { type: "separator" },
        { label: "New Collection", accelerator: "CmdOrCtrl+Shift+N", click: cmd("new-collection") },
        { label: "Import Kindle Highlights…", click: cmd("clippings") },
        { type: "separator" },
        { label: "Open Library Folder", click: () => shell.openPath(library.root) },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "close" as const }]
          : [{ type: "separator" as const }, { label: "Settings…", accelerator: "Ctrl+,", click: cmd("settings") }, { role: "quit" as const }]),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Covers", accelerator: "CmdOrCtrl+1", click: cmd("view:grid") },
        { label: "List", accelerator: "CmdOrCtrl+2", click: cmd("view:list") },
        { label: "Shelves", accelerator: "CmdOrCtrl+3", click: cmd("view:shelves") },
        { label: "Bookcase", accelerator: "CmdOrCtrl+4", click: cmd("view:bookcase") },
        { type: "separator" },
        { label: "Find", accelerator: "CmdOrCtrl+F", click: cmd("find") },
        { type: "separator" },
        // Ctrl+Alt is AltGr on Windows, where it types letters like ś and đ.
        { label: "Toggle Sidebar", accelerator: isMac ? "Cmd+Alt+S" : "Ctrl+Shift+S", click: cmd("toggle-sidebar") },
        { label: "Toggle Details", accelerator: isMac ? "Cmd+Alt+I" : "Ctrl+Shift+I", click: cmd("toggle-inspector") },
        { type: "separator" },
        { label: "Bigger Covers", accelerator: "CmdOrCtrl+=", click: cmd("zoom-in") },
        { label: "Smaller Covers", accelerator: "CmdOrCtrl+-", click: cmd("zoom-out") },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" as const }]),
      ],
    },
    {
      label: "Book",
      submenu: [
        { label: "Send to Kindle…", accelerator: "CmdOrCtrl+Shift+K", click: cmd("send") },
        { label: "Convert…", accelerator: "CmdOrCtrl+Shift+C", click: cmd("convert") },
        { label: "Find Details Online…", accelerator: "CmdOrCtrl+Shift+M", click: cmd("metadata") },
        { label: "Edit Details…", accelerator: "CmdOrCtrl+E", click: cmd("edit") },
        { type: "separator" },
        { label: "Favorite", accelerator: "CmdOrCtrl+L", click: cmd("favorite") },
        // Ctrl+Backspace deletes a word in a text field on Windows; Delete does this there.
        { label: "Remove from Library…", accelerator: isMac ? "Cmd+Backspace" : "Delete", registerAccelerator: isMac, click: cmd("remove") },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------------ */
/* Life cycle                                                                */
/* ------------------------------------------------------------------------ */

const isBook = (arg: string) => !arg.startsWith("-") && READABLE.includes(extname(arg).slice(1).toLowerCase());

/** Opens books the system handed over, now or once the window can take them. */
function openFiles(files: string[]) {
  if (!files.length) return;
  if (win && library && listening) send("open-files", files);
  else queued.push(...files);
}

app.on("open-file", (event, path) => {
  event.preventDefault();
  openFiles([path]);
});

app.on("second-instance", (_event, argv, workingDirectory) => {
  // Explorer may pass paths relative to where it started the second copy.
  openFiles(argv.slice(1).filter(isBook).map((file) => resolve(workingDirectory, file)));
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// Every page the app makes stays put: frames may only show the book pages it
// creates, nothing opens new windows, and no permission is ever granted.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-frame-navigate", (event) => {
    if (event.isMainFrame) return;
    if (!/^(blob:|about:blank|data:)/.test(event.url)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
});

app.whenReady().then(async () => {
  if (!primary) return;
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  queued.push(...process.argv.slice(1).filter(isBook));
  // While developing, the dock shows Shelf's icon instead of Electron's.
  if (isMac && !app.isPackaged) app.dock?.setIcon(join(here, "../../build/icon.png"));
  library = await new Library(getSettings().libraryPath).open();
  library.onSaveError = () => send("save-failed");
  serve();
  buildMenu();
  createWindow();
  if (!isMac) win?.setMenuBarVisibility(false);
  // Windows shuts down and logs off without before-quit, so the library is saved here too.
  win?.on("session-end", () => library?.flushNow());
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

let quitting = false;
app.on("before-quit", async (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  await library?.settle().catch(() => {});
  app.quit();
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});
