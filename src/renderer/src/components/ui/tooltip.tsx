"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Portal } from "./portal";

type Side = "top" | "bottom" | "left" | "right";

const TRANSLATE: Record<Side, string> = {
  top: "-50% -100%",
  bottom: "-50% 0",
  left: "-100% -50%",
  right: "0 -50%",
};

/**
 * A short label over whatever it wraps. It waits 80ms before showing, so a
 * pointer passing by does nothing, then appears in 150ms and leaves at once.
 * Keyboard focus shows it too, and Escape hides it.
 */
export function Tooltip({
  content,
  side = "top",
  children,
}: {
  content: ReactNode;
  side?: Side;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const wait = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = () => {
    clearTimeout(wait.current);
    wait.current = setTimeout(() => setOpen(true), 80);
  };
  const hide = () => {
    clearTimeout(wait.current);
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const rect = anchor.current?.getBoundingClientRect();
    if (rect)
      setPlace({
        x:
          side === "left"
            ? rect.left - 8
            : side === "right"
              ? rect.right + 8
              : rect.left + rect.width / 2,
        y:
          side === "top"
            ? rect.top - 8
            : side === "bottom"
              ? rect.bottom + 8
              : rect.top + rect.height / 2,
      });
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);

  return (
    <span
      ref={anchor}
      className="inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <Portal>
        <AnimatePresence>
          {open && place && (
            <motion.span
              role="tooltip"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { duration: 0.15, ease: "easeOut" },
              }}
              exit={{
                opacity: 0,
                scale: 0.98,
                transition: { duration: 0.05, ease: "easeOut" },
              }}
              style={{
                left: place.x,
                top: place.y,
                translate: TRANSLATE[side],
              }}
              className="pointer-events-none fixed z-[90] rounded-lg bg-foreground px-2 py-1 text-caption font-medium whitespace-nowrap text-background shadow-float"
            >
              {content}
            </motion.span>
          )}
        </AnimatePresence>
      </Portal>
    </span>
  );
}
