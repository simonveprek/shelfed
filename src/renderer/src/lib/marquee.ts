import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { isMac } from "./api";
import { useStore } from "./store";

/*
 * Selecting books by drawing a box around them, as on a desktop: press on
 * empty space and drag, and every book the box touches is selected. Holding
 * Cmd on a Mac, Ctrl on Windows, or Shift adds them to what's selected
 * already. Near the top or bottom edge the view scrolls on, and the box with it.
 */

/** A box in the scrolling view's own space: from its top left, scrolled along. */
export type Box = { x: number; y: number; width: number; height: number };

export const touches = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** How far the pointer moves before a press becomes a box rather than a click. */
const MOVED = 5;
/** How near an edge the pointer scrolls the view, and how fast at most. */
const EDGE = 48;
const FASTEST = 22;

export function useMarquee(scroller: RefObject<HTMLElement | null>, booksIn: (box: Box) => string[]) {
  const [box, setBox] = useState<Box | null>(null);
  const hits = useRef(booksIn);
  hits.current = booksIn;
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  /** Starts a box from a press on empty space. */
  const begin = (e: ReactMouseEvent) => {
    const view = scroller.current;
    if (e.button !== 0 || !view) return;
    e.preventDefault();
    const adding = e.shiftKey || (isMac ? e.metaKey : e.ctrlKey);
    const base = adding ? useStore.getState().selection : [];
    if (!adding) useStore.setState({ selection: [] });
    const at = (x: number, y: number) => {
      const r = view.getBoundingClientRect();
      return { x: x - r.left + view.scrollLeft, y: y - r.top + view.scrollTop };
    };
    const start = at(e.clientX, e.clientY);
    let pointer = { x: e.clientX, y: e.clientY };
    let drawing = false;
    let timer = 0;

    const update = () => {
      const end = at(pointer.x, pointer.y);
      const next = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
      if (!drawing && next.width + next.height < MOVED) return;
      drawing = true;
      setBox(next);
      const ids = hits.current(next);
      useStore.setState({ selection: [...new Set([...base, ...ids])], ...(ids.length ? { anchor: ids[0] } : {}) });
    };
    // Near the top or bottom, the view scrolls on its own, faster the nearer. A timer rather than
    // animation frames, which stop in a window that isn't showing.
    const roll = () => {
      const r = view.getBoundingClientRect();
      const over = pointer.y < r.top + EDGE ? pointer.y - (r.top + EDGE) : pointer.y > r.bottom - EDGE ? pointer.y - (r.bottom - EDGE) : 0;
      if (drawing && over) {
        view.scrollTop += Math.max(-FASTEST, Math.min(FASTEST, over / 2));
        update();
      }
    };
    const move = (m: MouseEvent) => {
      pointer = { x: m.clientX, y: m.clientY };
      update();
    };
    const end = () => {
      stop.current?.();
    };
    const key = (k: KeyboardEvent) => {
      if (k.key !== "Escape") return;
      useStore.setState({ selection: base });
      end();
    };
    stop.current = () => {
      clearInterval(timer);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("keydown", key);
      stop.current = null;
      setBox(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    window.addEventListener("keydown", key);
    timer = window.setInterval(roll, 16);
  };

  return { box, begin };
}

/** The box itself, drawn over the books. */
export const boxStyle = (box: Box) =>
  ({
    position: "absolute",
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
    border: "1px solid var(--accent)",
    background: "color-mix(in oklab, var(--accent) 14%, transparent)",
    borderRadius: 3,
    pointerEvents: "none",
    zIndex: 5,
  }) as const;
