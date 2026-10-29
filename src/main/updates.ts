import { app, net, shell } from "electron";
import log from "electron-log/main";
import updater from "electron-updater";
import type { UpdateState } from "../shared/types";
import { newer } from "../shared/version";
import { t } from "../shared/i18n";

const { autoUpdater } = updater;

const REPO = "simonveprek/shelfed";
const RELEASES = `https://github.com/${REPO}/releases/latest`;
/** How often to look again while Shelfed stays open. */
const EVERY = 6 * 60 * 60 * 1000;

/**
 * New versions, from the GitHub releases.
 *
 * On Windows they download quietly and go in on the next restart. A Mac app
 * can only replace itself when it's signed, and Shelfed isn't yet, so on macOS
 * and Linux Shelfed only says a new version is out and links to it.
 */
const installs = app.isPackaged && process.platform === "win32";

let state: UpdateState = { state: "idle" };
let tell: (state: UpdateState) => void = () => {};
let busy: Promise<void> | null = null;

function set(next: UpdateState) {
  state = next;
  tell(state);
}

export const updateState = () => state;

/** Starts looking for updates, now and then every few hours, when told to. */
export function watchUpdates(send: (state: UpdateState) => void, automatic: () => boolean) {
  tell = send;
  autoUpdater.logger = log;
  if (installs) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("update-available", (info) => set({ state: "downloading", version: info.version, progress: 0 }));
    autoUpdater.on("download-progress", (p) => state.state === "downloading" && set({ ...state, progress: p.percent / 100 }));
    autoUpdater.on("update-downloaded", (info) => set({ state: "ready", version: info.version }));
    autoUpdater.on("update-not-available", () => set({ state: "none" }));
  }
  if (!app.isPackaged) return;
  const look = () => automatic() && checkForUpdates(true).catch(() => {});
  setTimeout(look, 15_000);
  setInterval(look, EVERY).unref?.();
}

/** Looks once. Quietly, it keeps going wrong to itself. */
export function checkForUpdates(quiet = false): Promise<void> {
  busy ??= (async () => {
    // Nothing to do while one is already on its way or waiting.
    if (state.state === "downloading" || state.state === "ready") return;
    if (!quiet) set({ state: "checking" });
    try {
      if (installs) await autoUpdater.checkForUpdates();
      else await checkGitHub();
    } catch (error) {
      log.warn("Update check failed", error);
      if (!quiet) set({ state: "failed", error: t("Couldn't reach GitHub. Try again later.") });
      else if (state.state === "checking") set({ state: "idle" });
    }
  })().finally(() => (busy = null));
  return busy;
}

/** Restarts into the downloaded version. */
export function installUpdate() {
  if (state.state === "ready") autoUpdater.quitAndInstall();
  else if (state.state === "available") shell.openExternal(state.url);
}

async function checkGitHub() {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `Shelfed/${app.getVersion()}` },
  });
  // No releases yet, or the repository is private: nothing newer to tell of.
  if (res.status === 404) return set({ state: "none" });
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const release = (await res.json()) as { tag_name?: string; html_url?: string };
  const version = (release.tag_name ?? "").replace(/^v/, "");
  set(newer(version, app.getVersion()) ? { state: "available", version, url: release.html_url ?? RELEASES } : { state: "none" });
}
