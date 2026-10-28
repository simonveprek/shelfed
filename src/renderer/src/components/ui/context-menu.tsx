"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx, EASE } from "./cx";
import { Portal } from "./portal";

type Opened = { x: number; y: number; id: number; keyboard: boolean };
type Place = { left: number; top: number; origin: string };

const ITEMS =
  '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])';

/**
 * A menu that opens where the pointer is, on a right click or a long press.
 * The menu key and Shift F10 open it from the keyboard. It opens in 250ms
 * and closes in 150ms. A click away, Escape or a scroll closes it, and the
 * arrows move through it. Picking an item closes it too.
 */
export function ContextMenu({
  menu,
  label,
  width = 240,
  className,
  children,
}: {
  /** The items, from menu.tsx. A function gets close, for items that need it. */
  menu: ReactNode | ((close: () => void) => ReactNode);
  label: string;
  width?: number;
  /** For the area that listens for the right click. */
  className?: string;
  /** The area. */
  children: ReactNode;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const open = (x: number, y: number, keyboard = false) => {
    count.current += 1;
    if (document.activeElement instanceof HTMLElement)
      returnTo.current = document.activeElement;
    setPlace(null);
    setOpened({ x, y, id: count.current, keyboard });
  };

  const close = (refocus = false) => {
    setOpened(null);
    if (refocus) returnTo.current?.focus({ preventScroll: true });
  };

  // Kept inside the window, flipping left or up near an edge.
  useLayoutEffect(() => {
    if (!opened) return;
    const measure = () => {
      const node = surface.current;
      if (!node) return;
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const flipX = opened.x + w > window.innerWidth - 8;
      const flipY = opened.y + h > window.innerHeight - 8;
      setPlace({
        left: Math.max(8, flipX ? opened.x - w : opened.x),
        top: Math.max(8, flipY ? opened.y - h : opened.y),
        origin: `${flipY ? "bottom" : "top"} ${flipX ? "right" : "left"}`,
      });
    };
    measure();
  }, [opened]);

  // Focus moves in once it shows, so the arrows work straight away.
  useEffect(() => {
    if (!opened || !place) return;
    if (opened.keyboard)
      surface.current?.querySelector<HTMLElement>(ITEMS)?.focus();
    else surface.current?.focus({ preventScroll: true });
  }, [opened, place]);

  useEffect(() => {
    if (!opened) return;
    const away = (event: globalThis.PointerEvent) => {
      if (!surface.current?.contains(event.target as Node)) setOpened(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpened(null);
      if (opened.keyboard) returnTo.current?.focus({ preventScroll: true });
    };
    const gone = () => setOpened(null);
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", escape);
    window.addEventListener("scroll", gone, true);
    window.addEventListener("resize", gone);
    window.addEventListener("blur", gone);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", gone, true);
      window.removeEventListener("resize", gone);
      window.removeEventListener("blur", gone);
    };
  }, [opened]);

  useEffect(() => () => window.clearTimeout(press.current?.timer), []);

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  // iOS has no right click event, so a held finger opens it instead.
  const down = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    cancelPress();
    const { clientX: x, clientY: y } = event;
    press.current = {
      x,
      y,
      timer: window.setTimeout(() => {
        press.current = null;
        open(x, y);
      }, 500),
    };
  };

  const drift = (event: PointerEvent) => {
    if (!press.current) return;
    const far =
      Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 10;
    if (far) cancelPress();
  };

  const rightClick = (event: MouseEvent) => {
    event.preventDefault();
    cancelPress();
    open(event.clientX, event.clientY);
  };

  const keys = (event: KeyboardEvent) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const target = event.target as HTMLElement;
      const box = target.getBoundingClientRect();
      open(box.left + 8, box.bottom + 4, true);
    }
  };

  const move = (event: KeyboardEvent) => {
    if (event.key === "Tab") {
      event.preventDefault();
      close(true);
      return;
    }
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (!(event.key in steps) && event.key !== "Home" && event.key !== "End")
      return;
    event.preventDefault();
    const items = Array.from(
      surface.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : at === -1
            ? steps[event.key] > 0
              ? 0
              : items.length - 1
            : (at + steps[event.key] + items.length) % items.length;
    items[next]?.focus();
  };

  // A picked item closes the menu after it runs.
  const picked = (event: MouseEvent) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>(ITEMS);
    if (item) close(opened?.keyboard ?? false);
  };

  return (
    <>
      <div
        onContextMenu={rightClick}
        onPointerDown={down}
        onPointerMove={drift}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onKeyDown={keys}
        className={cx("[-webkit-touch-callout:none]", className)}
      >
        {children}
      </div>
      <Portal>
        <AnimatePresence>
          {opened && (
            <motion.div
              key={opened.id}
              ref={surface}
              role="menu"
              aria-label={label}
              tabIndex={-1}
              onKeyDown={move}
              onClick={picked}
              onContextMenu={(event) => event.preventDefault()}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { duration: 0.25, ease: EASE },
              }}
              exit={{
                opacity: 0,
                scale: 0.99,
                transition: { duration: 0.15, ease: EASE },
              }}
              style={{
                position: "fixed",
                left: place?.left ?? opened.x,
                top: place?.top ?? opened.y,
                width,
                maxWidth: "calc(100vw - 16px)",
                transformOrigin: place?.origin ?? "top left",
                visibility: place ? "visible" : "hidden",
              }}
              className="z-[90] rounded-[18px] border border-border bg-card p-1.5 shadow-float outline-none"
            >
              {typeof menu === "function" ? menu(() => setOpened(null)) : menu}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
