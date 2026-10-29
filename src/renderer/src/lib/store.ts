import { create } from "zustand";
import type { Book, BootState, Collection, KindleDevice, KindleFile, KindleOnUsb, Settings, UpdateState } from "../../../shared/types";
import type { PointMood } from "@/components/fragms/points-data";
import { toast } from "@/components/ui";
import { api } from "./api";
import { debounce } from "./util";

export type Browse = "author" | "series" | "tag" | "format";

export type Section =
  | { kind: "all" | "reading" | "unread" | "finished" | "favorites" | "recent" }
  | { kind: "collection"; id: string }
  | { kind: "browse"; by: Browse }
  | { kind: "discover" }
  /** The books already on the Kindle plugged in by cable. */
  | { kind: "kindle" }
  | { kind: "group"; by: Browse; value: string };

export type Dialog =
  | { kind: "send" | "convert" | "metadata" | "edit"; ids: string[] }
  | { kind: "settings"; tab?: SettingsSection }
  | { kind: "rename-collection"; id: string }
  | { kind: "clippings"; text: string; from: string };

export type Job = {
  id: string;
  title: string;
  detail?: string;
  /** From 0 to 1, or null while it cannot tell. */
  progress: number | null;
  state: "running" | "done" | "failed";
};

type State = {
  ready: boolean;
  books: Book[];
  collections: Collection[];
  settings: Settings;
  platform: string;
  version: string;
  section: Section;
  query: string;
  selection: string[];
  anchor: string | null;
  reading: { id: string; ext: string } | null;
  dialog: Dialog | null;
  confirmRemove: string[] | null;
  palette: boolean;
  jobs: Job[];
  mood: PointMood | null;
  dragging: boolean;
  /** Books being dragged around inside Shelfed. */
  carrying: string[] | null;
  /** What the Kindle is busy with, so its 3D model can show it. */
  kindleActivity: KindleActivity | null;
  /** Kindles on USB and the ones that open as a drive, once first looked for. */
  kindlePort: KindlePort | null;
  /**
   * How the Kindle plugged in takes books: as a drive, or not at all by
   * cable because it connects like a phone. Waiting while one on USB might
   * still be about to open as a drive.
   */
  kindleCable: "drive" | "phone" | "waiting" | null;
  /** The book files on a Kindle plugged in as a drive, or null with none. */
  kindleFiles: KindleFile[] | null;
  /** Asking whether to take finished books off the Kindle. */
  confirmTidy: boolean;
  /** When a Kindle was last plugged in, for the welcome it gets. */
  kindleArrived: number | null;
  /** The welcome is showing. */
  onboarding: boolean;
  /** Where finding a new version of Shelfed has got to. */
  update: UpdateState;
};

export type SettingsSection = "library" | "appearance" | "reading" | "kindle" | "sending" | "converting" | "about";

export type KindlePort = { usb: KindleOnUsb[]; drives: KindleDevice[] };

export type KindleActivity = { via: "cable" | "email"; bookId: string; state: "arriving" | "working" | "done" | "failed"; progress: number };

export const useStore = create<State>(() => ({
  ready: false,
  books: [],
  collections: [],
  settings: null as unknown as Settings,
  platform: window.shelf.platform,
  version: "",
  section: { kind: "all" },
  query: "",
  selection: [],
  anchor: null,
  reading: null,
  dialog: null,
  confirmRemove: null,
  palette: false,
  jobs: [],
  mood: null,
  dragging: false,
  carrying: null,
  kindleActivity: null,
  kindlePort: null,
  kindleCable: null,
  kindleFiles: null,
  confirmTidy: false,
  kindleArrived: null,
  onboarding: false,
  update: { state: "idle" },
}));

const set = useStore.setState;
const get = useStore.getState;

export function hydrate(state: BootState) {
  // When the library is first on screen, for startup measurements.
  (window as unknown as { shelfReadyAt?: number }).shelfReadyAt ??= Math.round(performance.now());
  set({
    ready: true,
    books: state.books,
    collections: state.collections,
    settings: state.settings,
    version: state.version,
    selection: [],
    onboarding: !state.settings.onboarded,
  });
}

export const bookById = (id: string) => get().books.find((b) => b.id === id);

/** Puts a book the main process returned back into the list. */
export function upsert(book: Book) {
  set((s) => {
    const i = s.books.findIndex((b) => b.id === book.id);
    if (i === -1) return { books: [...s.books, book] };
    const books = s.books.slice();
    books[i] = book;
    return { books };
  });
}

export function drop(ids: string[]) {
  const gone = new Set(ids);
  set((s) => ({ books: s.books.filter((b) => !gone.has(b.id)), selection: s.selection.filter((id) => !gone.has(id)) }));
}

/** Changes books on screen at once and saves them behind. */
export async function patchBooks(ids: string[], patch: (book: Book) => Partial<Book>, relocate = false) {
  const changes = new Map<string, Partial<Book>>();
  set((s) => ({
    books: s.books.map((b) => {
      if (!ids.includes(b.id)) return b;
      const p = patch(b);
      // The day a book is finished is kept, for the year's count.
      if (p.status === "finished" && b.status !== "finished") p.finishedAt ??= Date.now();
      changes.set(b.id, p);
      return { ...b, ...p };
    }),
  }));
  try {
    for (const [id, p] of changes) {
      const saved = await api.update(id, p, relocate);
      if (relocate) upsert(saved);
    }
  } catch (error) {
    toast.error((error as Error).message);
  }
}

let pending: Partial<Settings> = {};
export const persist = debounce(() => {
  api.settings(pending);
  pending = {};
}, 300);

export function setSetting(patch: Partial<Settings>) {
  set((s) => ({
    settings: {
      ...s.settings,
      ...patch,
      kindle: { ...s.settings.kindle, ...patch.kindle },
      reader: { ...s.settings.reader, ...patch.reader },
      bookcase: { ...s.settings.bookcase, ...patch.bookcase },
    },
  }));
  const settings = get().settings;
  pending = { ...pending, ...patch };
  // Nested settings go whole, so a later change never drops an earlier one.
  if (patch.kindle) pending.kindle = settings.kindle;
  if (patch.reader) pending.reader = settings.reader;
  if (patch.bookcase) pending.bookcase = settings.bookcase;
  persist();
}

export function saveCollections(collections: Collection[]) {
  set({ collections });
  api.saveCollections(collections);
}

let moodTimer: ReturnType<typeof setTimeout> | undefined;
/** The little one in the sidebar shows a feeling for a moment. */
export function flashMood(mood: PointMood, ms = 1800) {
  clearTimeout(moodTimer);
  set({ mood });
  moodTimer = setTimeout(() => set({ mood: null }), ms);
}

export function failed(error: unknown) {
  toast.error(error instanceof Error ? error.message : String(error));
  flashMood("sad", 2600);
}

/* ------------------------------------------------------------------------ */
/* Work in progress                                                          */
/* ------------------------------------------------------------------------ */

let jobSeq = 0;

export function startJob(title: string) {
  const id = `job${++jobSeq}`;
  set((s) => ({ jobs: [...s.jobs, { id, title, progress: null, state: "running" }] }));
  const update = (patch: Partial<Job>) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }));
  const close = (ms: number) => setTimeout(() => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })), ms);
  return {
    id,
    update,
    done(text: string) {
      update({ state: "done", progress: 1, detail: undefined });
      close(400);
      toast.success(text);
      flashMood("happy");
    },
    fail(error: unknown) {
      update({ state: "failed" });
      close(0);
      failed(error);
    },
  };
}

export type JobHandle = ReturnType<typeof startJob>;
