"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx, EASE } from "./cx";
import { useFocusTrap } from "./dialog";
import { Portal } from "./portal";

export type FloatSide = "top" | "bottom";
export type FloatAlign = "start" | "center" | "end";

type Place = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  /** Where the trigger's middle is, across the surface, for the scale origin. */
  originX: number;
};

/**
 * Where a floating surface goes next to its anchor, kept 8px inside the
 * window. It follows the anchor while the page scrolls or resizes.
 */
export function useAnchored(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  side: FloatSide,
  align: FloatAlign,
  width: number,
) {
  const [place, setPlace] = useState<Place | null>(null);

  const update = useCallback(() => {
    const node = anchor.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const room = document.documentElement.clientWidth;
    const w = Math.min(width, room - 16);
    const start =
      align === "start"
        ? rect.left
        : align === "end"
          ? rect.right - w
          : rect.left + rect.width / 2 - w / 2;
    const left = Math.max(8, Math.min(start, room - w - 8));
    const originX = Math.max(0, Math.min(w, rect.left + rect.width / 2 - left));
    setPlace(
      side === "bottom"
        ? { left, top: rect.bottom + 8, width: w, originX }
        : { left, bottom: window.innerHeight - rect.top + 8, width: w, originX },
    );
  }, [anchor, side, align, width]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, update]);

  return { place, update };
}

type Trigger = {
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** Spread onto the button that opens it. */
  props: {
    "aria-haspopup": "dialog";
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
  };
};

/**
 * A small surface that opens from a button, for filters, quick settings and
 * short forms. It grows from the button in 250ms and closes in 150ms. A
 * click away or Escape closes it, and it lives at the end of the page so no
 * panel clips it.
 */
export function Popover({
  trigger,
  label,
  side = "bottom",
  align = "start",
  width = 300,
  className,
  children,
}: {
  trigger: (state: Trigger) => ReactNode;
  /** What it holds, read out when it opens. */
  label: string;
  side?: FloatSide;
  align?: FloatAlign;
  width?: number;
  className?: string;
  /** What is inside, or a function given close for buttons that need it. */
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const id = useId();
  const { place, update } = useAnchored(open, anchor, side, align, width);
  const trap = useFocusTrap(open, surface);

  const close = () => setOpen(false);
  const toggle = () => {
    if (!open) update();
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchor.current?.contains(target) || surface.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <span ref={anchor} className="inline-flex">
      {trigger({
        open,
        toggle,
        close,
        props: {
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-controls": id,
          onClick: toggle,
        },
      })}
      <Portal>
        <AnimatePresence>
          {open && place && (
            <motion.div
              ref={surface}
              id={id}
              role="dialog"
              aria-label={label}
              tabIndex={-1}
              onKeyDown={(event) => {
                // Escape closes only this, not a sheet or dialog it sits in.
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setOpen(false);
                }
                trap(event);
              }}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, ease: EASE } }}
              exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: EASE } }}
              style={{
                left: place.left,
                top: place.top,
                bottom: place.bottom,
                width: place.width,
                transformOrigin: `${place.originX}px ${side === "bottom" ? "top" : "bottom"}`,
              }}
              className={cx(
                "fixed z-[85] rounded-[18px] border border-border bg-card p-4 shadow-float outline-none",
                className,
              )}
            >
              {typeof children === "function" ? children(close) : children}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </span>
  );
}
