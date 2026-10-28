import type { MouseEvent } from "react";
import type { Book } from "../../../shared/types";
import { isMac } from "./api";
import { useStore } from "./store";

export const BOOK_MIME = "application/x-shelf-books";

/** Click, Cmd or Ctrl click, and Shift click, the way a file browser does. */
export function selectBook(e: MouseEvent | KeyboardEvent | null, id: string, visible: Book[]) {
  const { selection, anchor } = useStore.getState();
  const toggle = e && (isMac ? e.metaKey : e.ctrlKey);
  if (e?.shiftKey && anchor) {
    const a = visible.findIndex((b) => b.id === anchor);
    const b = visible.findIndex((b) => b.id === id);
    if (a !== -1 && b !== -1) {
      const range = visible.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
      useStore.setState({ selection: toggle ? [...new Set([...selection, ...range])] : range });
      return;
    }
  }
  if (toggle) {
    useStore.setState({ selection: selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id], anchor: id });
    return;
  }
  useStore.setState({ selection: [id], anchor: id });
}

/** The books to act on from a right click: the selection, or the book under the pointer. */
export function targetIds(id: string) {
  const { selection } = useStore.getState();
  if (!selection.includes(id)) {
    useStore.setState({ selection: [id], anchor: id });
    return [id];
  }
  return selection;
}
