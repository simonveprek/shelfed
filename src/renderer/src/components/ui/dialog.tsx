"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx, EASE } from "./cx";
import { Portal } from "./portal";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps focus inside a panel while it is open. Focus moves in when it opens,
 * Tab cycles through what is inside, and focus goes back to whatever opened
 * it when it closes. Put the handler it returns on the panel as onKeyDown.
 */
export function useFocusTrap(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    let node = panel.current;
    const frame = requestAnimationFrame(() => {
      node = panel.current;
      if (!node || node.contains(document.activeElement)) return;
      (initialFocus?.current ?? node).focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      // Hand focus back only if it is still inside, so a click elsewhere keeps it.
      const now = document.activeElement;
      if (!now || now === document.body || node?.contains(now))
        before?.focus({ preventScroll: true });
    };
  }, [open, panel, initialFocus]);

  return (event: KeyboardEvent<HTMLElement>) => {
    const node = panel.current;
    if (event.key !== "Tab" || !node) return;
    const items = Array.from(
      node.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((item) => item.getClientRects().length > 0);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (event.shiftKey && (at === first || at === node)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && at === last) {
      event.preventDefault();
      first.focus();
    }
  };
}

type Ids = {
  title: string;
  description: string;
  setTitled: (on: boolean) => void;
  setDescribed: (on: boolean) => void;
};

const DialogIds = createContext<Ids | null>(null);

/**
 * A panel over the page. It scales up from 96% in 250ms and back down,
 * faster, in 150ms. Escape and a click on the dimmed page close it, and
 * focus goes back to what opened it.
 */
export function Dialog({
  open,
  onClose,
  label,
  position = "center",
  role = "dialog",
  initialFocus,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  /** In the middle, or near the top the way a search opens. */
  position?: "center" | "top";
  /** alertdialog for a question that needs an answer. */
  role?: "dialog" | "alertdialog";
  /** What gets focus when it opens. The panel itself if not set. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const trap = useFocusTrap(open, panel, initialFocus);
  const base = useId();
  const [titled, setTitled] = useState(false);
  const [described, setDescribed] = useState(false);
  const ids: Ids = {
    title: `${base}title`,
    description: `${base}description`,
    setTitled,
    setDescribed,
  };

  useEffect(() => {
    if (!open) return;
    const escape = (event: globalThis.KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            className={cx(
              "fixed inset-0 z-[80] flex justify-center bg-black/45 px-3",
              position === "top"
                ? "items-start pt-[14vh]"
                : "items-end pb-3 sm:items-center sm:pb-0",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
            onPointerDown={(event) =>
              event.target === event.currentTarget && onClose()
            }
          >
            <motion.div
              ref={panel}
              role={role}
              aria-modal="true"
              aria-label={label}
              aria-labelledby={titled ? ids.title : undefined}
              aria-describedby={described ? ids.description : undefined}
              tabIndex={-1}
              onKeyDown={trap}
              className={cx(
                "relative w-full max-w-[440px] overflow-hidden rounded-card border border-border bg-card shadow-float outline-none",
                className,
              )}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { duration: 0.25, ease: EASE },
              }}
              exit={{
                opacity: 0,
                scale: 0.96,
                transition: { duration: 0.15, ease: EASE },
              }}
            >
              <DialogIds.Provider value={ids}>{children}</DialogIds.Provider>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/** The title and a line under it. The dialog is named and described by them. */
export function DialogHeader({
  title,
  description,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  const ids = useContext(DialogIds);
  const setTitled = ids?.setTitled;
  const setDescribed = ids?.setDescribed;
  const hasDescription = description != null;

  useLayoutEffect(() => {
    if (!setTitled) return;
    setTitled(true);
    return () => setTitled(false);
  }, [setTitled]);
  useLayoutEffect(() => {
    if (!setDescribed || !hasDescription) return;
    setDescribed(true);
    return () => setDescribed(false);
  }, [setDescribed, hasDescription]);

  return (
    <div className={cx("px-6 pt-6", className)}>
      <h2 id={ids?.title} className="text-[17px] leading-snug font-medium">
        {title}
      </h2>
      {hasDescription && (
        <p
          id={ids?.description}
          className="mt-1.5 text-[14px] leading-relaxed text-muted"
        >
          {description}
        </p>
      )}
    </div>
  );
}

/** The buttons at the bottom. In a row, or stacked on a phone. */
export function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex flex-col-reverse gap-2 p-6 sm:flex-row sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}
