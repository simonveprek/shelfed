"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx, EASE } from "./cx";
import { useAnchored, type FloatAlign, type FloatSide } from "./popover";
import { Portal } from "./portal";

/**
 * A card that shows more about whatever it wraps, like a teammate's profile
 * behind their name. It opens after a short rest of the pointer, so passing
 * over does nothing, and stays while the pointer moves onto it. On touch a
 * first tap opens it and a second one follows the link.
 */
export function HoverCard({
  content,
  side = "bottom",
  align = "start",
  width = 300,
  openDelay = 400,
  closeDelay = 150,
  className,
  children,
}: {
  content: ReactNode;
  side?: FloatSide;
  align?: FloatAlign;
  width?: number;
  /** How long the pointer rests before it opens, in ms. */
  openDelay?: number;
  /** How long it waits after the pointer leaves, in ms. */
  closeDelay?: number;
  className?: string;
  /** The trigger, usually a link or a name. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const wait = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touch = useRef(false);
  const { place, update } = useAnchored(open, anchor, side, align, width);

  const show = (delay: number) => {
    clearTimeout(wait.current);
    wait.current = setTimeout(() => {
      update();
      setOpen(true);
    }, delay);
  };
  const hide = (delay: number) => {
    clearTimeout(wait.current);
    wait.current = setTimeout(() => setOpen(false), delay);
  };

  useEffect(() => () => clearTimeout(wait.current), []);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchor.current?.contains(target) || card.current?.contains(target)) return;
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
    <span
      ref={anchor}
      className="inline-flex"
      onPointerDown={(event) => {
        touch.current = event.pointerType !== "mouse";
      }}
      onPointerEnter={(event) => event.pointerType === "mouse" && show(openDelay)}
      onPointerLeave={(event) => event.pointerType === "mouse" && hide(closeDelay)}
      onFocus={() => show(openDelay)}
      onBlur={(event) => {
        if (!card.current?.contains(event.relatedTarget as Node)) hide(closeDelay);
      }}
      onClickCapture={(event) => {
        // On touch the first tap opens the card instead of following the link.
        if (touch.current && !open) {
          event.preventDefault();
          event.stopPropagation();
          clearTimeout(wait.current);
          update();
          setOpen(true);
        }
      }}
    >
      {children}
      <Portal>
        <AnimatePresence>
          {open && place && (
            <motion.div
              ref={card}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, ease: EASE } }}
              exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: EASE } }}
              onPointerEnter={() => clearTimeout(wait.current)}
              onPointerLeave={(event) => event.pointerType === "mouse" && hide(closeDelay)}
              style={{
                left: place.left,
                top: place.top,
                bottom: place.bottom,
                width: place.width,
                transformOrigin: `${place.originX}px ${side === "bottom" ? "top" : "bottom"}`,
              }}
              className={cx(
                "fixed z-[85] rounded-[18px] border border-border bg-card p-4 shadow-float",
                className,
              )}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </span>
  );
}
