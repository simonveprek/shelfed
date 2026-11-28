import { app, safeStorage } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Book, HardcoverSettings } from "../shared/types";
import { asker, clientId, connect, HardcoverError, revoke, syncHardcover, whoAmI, type Library, type Outcome, type Tokens } from "./hardcover";
import { getSettings, setSettings } from "./settings";
import { t, tn } from "../shared/i18n";

/*
 * Hardcover inside Shelfed: its keys kept encrypted beside the settings, a
 * look at Hardcover a little after starting and every half hour, and soon
 * after a book's status, rating or place changes here. Nothing runs until
 * someone connects, and disconnecting tells Hardcover to forget Shelfed.
 */

const keyFile = () => join(app.getPath("userData"), "hardcover.bin");

let tokens: Tokens | null | undefined;

function readKeys(): Tokens | null {
  if (tokens !== undefined) return tokens;
  try {
    const data = readFileSync(keyFile());
    tokens = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString("utf8")) as Tokens;
  } catch {
    tokens = null;
  }
  return tokens;
}

/** Kept at once, and whole: a refresh key works only once, so losing a new one means connecting again. */
function keepKeys(next: Tokens) {
  tokens = next;
  const text = JSON.stringify(next);
  writeFileSync(keyFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, "utf8"));
}

const ask = () => asker({ get: readKeys, set: keepKeys }, app.getVersion());

let library: (() => Library) | null = null;
let tell: ((books: Book[], settings: HardcoverSettings | undefined) => void) | null = null;

/** Books marked here since connecting, to add at Hardcover if it hasn't them. Kept in settings, so a restart doesn't lose them. */
const pending = () => new Set(getSettings().hardcover?.pending ?? []);

const set = (patch: Partial<HardcoverSettings>) => {
  const next = { ...getSettings().hardcover, ...patch };
  setSettings({ hardcover: next });
  return next;
};

export function hardcoverState() {
  const settings = getSettings().hardcover;
  return { available: Boolean(clientId()), connected: Boolean(settings?.user && existsSync(keyFile())), settings };
}

let running: Promise<Outcome | null> | null = null;

/** Brings Shelfed and Hardcover into step, now. Gives back what moved, or null when not connected or turned off. */
export function syncNow(): Promise<Outcome | null> {
  running ??= (async () => {
    const state = hardcoverState();
    if (!state.connected || state.settings?.sync === false || !library || !state.settings?.user) return null;
    const lib = library();
    const changed = new Map<string, Book>();
    const watched: Library = {
      books: lib.books,
      async update(id, patch) {
        const book = await lib.update(id, patch);
        if (book) changed.set(id, book as Book);
        return book;
      },
    };
    const waiting = pending();
    try {
      const outcome = await syncHardcover(ask(), watched, state.settings.user.id, waiting);
      const settings = set({ lastSync: Date.now(), lastError: undefined, pending: [] });
      tell?.([...changed.values()], settings);
      return outcome;
    } catch (error) {
      const signedOut = error instanceof HardcoverError && error.signedOut;
      const message = signedOut ? t("Hardcover has forgotten this connection. Connect again to carry on.") : t("Couldn't reach Hardcover: {reason}", { reason: (error as Error).message });
      const settings = set({ lastError: message });
      tell?.([...changed.values()], settings);
      throw new Error(message);
    }
  })().finally(() => (running = null));
  return running;
}

let soon: NodeJS.Timeout | null = null;

/**
 * A book changed here: its status, rating or how far in. It's sent along a
 * little later, so a run of changes goes as one.
 */
export function bookChanged(before: Book, patch: Partial<Book>) {
  if (!hardcoverState().connected) return;
  const matters =
    (patch.status !== undefined && patch.status !== before.status) ||
    (patch.rating !== undefined && patch.rating !== before.rating) ||
    (patch.progress !== undefined && Math.abs((patch.progress ?? 0) - (before.hardcover?.progress ?? -1)) >= 0.05);
  if (!matters) return;
  if (!before.hardcover && (patch.status !== undefined || patch.rating !== undefined)) {
    set({ pending: [...new Set([...(getSettings().hardcover?.pending ?? []), before.id])] });
  }
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => {
    soon = null;
    syncNow().catch(() => undefined);
  }, Number(process.env.SHELF_HARDCOVER_DELAY ?? 8000));
}

/** Watching starts once the library is open, and only does anything once connected. */
export function watchHardcover(lib: () => Library, onChange: (books: Book[], settings: HardcoverSettings | undefined) => void) {
  library = lib;
  tell = onChange;
  setTimeout(() => syncNow().catch(() => undefined), 15_000);
  setInterval(() => syncNow().catch(() => undefined), 30 * 60_000).unref();
}

let connecting: AbortController | null = null;

/** Connects through Hardcover's page in the browser, then brings everything into step. */
export async function connectHardcover(open: (url: string) => void) {
  connecting?.abort();
  const controller = new AbortController();
  connecting = controller;
  try {
    const fresh = await connect(open, controller.signal);
    keepKeys(fresh);
    const user = await whoAmI(ask());
    set({ user, sync: true, lastError: undefined, pending: [] });
  } finally {
    if (connecting === controller) connecting = null;
  }
  const outcome = await syncNow().catch(() => null);
  return { ...hardcoverState(), outcome };
}

export function cancelConnecting() {
  connecting?.abort();
  connecting = null;
}

/** Forgets the connection here and at Hardcover. The books keep what they had; their links to Hardcover go. */
export async function disconnectHardcover() {
  const keys = readKeys();
  if (keys) await revoke(keys);
  tokens = null;
  await rm(keyFile(), { force: true });
  setSettings({ hardcover: undefined });
  const lib = library?.();
  const changed: Book[] = [];
  for (const book of lib?.books() ?? []) {
    if (!book.hardcover) continue;
    const updated = await lib!.update(book.id, { hardcover: undefined });
    if (updated) changed.push(updated as Book);
  }
  tell?.(changed, undefined);
  return hardcoverState();
}

/** What a sync did, in a line. */
export function said(outcome: Outcome) {
  const parts: string[] = [];
  if (outcome.pulled) parts.push(tn(outcome.pulled, "{n} book brought up to date here", "{n} books brought up to date here"));
  if (outcome.pushed + outcome.added) parts.push(tn(outcome.pushed + outcome.added, "{n} sent to Hardcover", "{n} sent to Hardcover"));
  return parts.join(", ") || t("Everything was already in step");
}

