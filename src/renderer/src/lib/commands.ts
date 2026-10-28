import { createCollection, openReader, pickAndImport, toggleFavorite } from "./actions";
import { patchBooks, setSetting, useStore } from "./store";

const set = useStore.setState;
const get = useStore.getState;

export type BookAction = "read" | "send" | "convert" | "metadata" | "edit" | "favorite" | "unread" | "reading" | "finished" | "remove";

/** Does one thing to the given books, from a menu, a key or a button. */
export function runAction(action: BookAction, ids: string[]) {
  if (!ids.length) return;
  switch (action) {
    case "read":
      return openReader(ids[0]);
    case "send":
    case "convert":
      return set({ dialog: { kind: action, ids } });
    case "metadata":
    case "edit":
      return set({ dialog: { kind: action, ids: [ids[0]] } });
    case "favorite":
      return toggleFavorite(ids);
    case "unread":
      return patchBooks(ids, () => ({ status: "unread", progress: 0, location: undefined }));
    case "reading":
      return patchBooks(ids, () => ({ status: "reading" }));
    case "finished":
      return patchBooks(ids, () => ({ status: "finished", progress: 1 }));
    case "remove":
      return set({ confirmRemove: ids });
  }
}

export function newCollection(ids: string[] = []) {
  const c = createCollection("New collection", ids);
  set({ section: { kind: "collection", id: c.id }, dialog: { kind: "rename-collection", id: c.id } });
}

/** Commands from the app menu and its shortcuts. */
export function runCommand(command: string) {
  const { selection, settings, reading } = get();
  // While reading, only a few commands make sense.
  if (reading && command !== "settings") return;
  switch (command) {
    case "import":
      return pickAndImport(false);
    case "import-folder":
      return pickAndImport(true);
    case "settings":
      return set({ dialog: { kind: "settings" } });
    case "clippings":
      return import("@/components/Clippings").then((m) => m.importClippings());
    case "find":
      return document.getElementById("search")?.focus();
    case "new-collection":
      return newCollection(selection);
    case "view:grid":
    case "view:list":
    case "view:shelves":
    case "view:bookcase":
      return setSetting({ view: command.slice(5) as "grid" | "list" | "shelves" | "bookcase" });
    case "toggle-sidebar":
      return setSetting({ sidebar: !settings.sidebar });
    case "toggle-inspector":
      return setSetting({ inspector: !settings.inspector });
    case "zoom-in":
      return setSetting({ gridSize: Math.min(260, settings.gridSize + 20) });
    case "zoom-out":
      return setSetting({ gridSize: Math.max(100, settings.gridSize - 20) });
    case "send":
    case "convert":
    case "metadata":
    case "edit":
    case "favorite":
    case "remove":
      return runAction(command, selection);
  }
}
