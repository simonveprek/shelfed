"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useId, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { IconButton } from "./button";
import { cx, EASE } from "./cx";
import { useFocusTrap } from "./dialog";
import { Portal } from "./portal";

/** True once the screen is at least this wide. Never on the server. */
function useWide(from: number | false) {
  return useSyncExternalStore(
    (change) => {
      if (!from) return () => {};
      const query = matchMedia(`(min-width: ${from}px)`);
      query.addEventListener("change", change);
      return () => query.removeEventListener("change", change);
    },
    () => (from ? matchMedia(`(min-width: ${from}px)`).matches : false),
    () => false,
  );
}

/** Holds the page still behind it, without the layout shifting. */
function useScrollLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const { style } = document.body;
    const before = { overflow: style.overflow, paddingRight: style.paddingRight };
    const gap = window.innerWidth - document.documentElement.clientWidth;
    style.overflow = "hidden";
    if (gap > 0) style.paddingRight = `${gap}px`;
    return () => {
      style.overflow = before.overflow;
      style.paddingRight = before.paddingRight;
    };
  }, [on]);
}

// Fields keep their own gestures, and the mouse only drags from the top.
const KEEPS_TOUCH = "input, textarea, select, [contenteditable], [data-drawer-no-drag]";
const KEEPS_MOUSE = `${KEEPS_TOUCH}, button, a`;

type Gesture = {
  start: number;
  last: number;
  at: number;
  velocity: number;
  dragging: boolean;
  /** The body is scrolled to the top, so pulling down moves the drawer. */
  canDrag: boolean;
};

/**
 * A drawer that rises from the bottom on a phone and holds like a native
 * sheet. Pull it down from anywhere to close it, or fling it. While the body
 * is scrolled, a pull scrolls it first. On wider screens it opens as a
 * dialog in the middle instead, unless dialogFrom is false.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  dialogFrom = 640,
  initialFocus,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Buttons pinned to the bottom, under the part that scrolls. */
  footer?: ReactNode;
  /** From this width in pixels it opens as a dialog. False keeps it a drawer everywhere. */
  dialogFrom?: number | false;
  /** What gets focus when it opens. The panel itself if not set. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  children?: ReactNode;
}) {
  const wide = useWide(dialogFrom);
  const drawer = !wide;
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const trap = useFocusTrap(open, panel, initialFocus);
  const id = useId();
  const y = useMotionValue(0);
  // The page behind lightens as the drawer is pulled away.
  const dim = useTransform(y, [0, 480], [1, 0]);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    y.set(0);
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose, y]);

  function begin(clientY: number, target: EventTarget | null) {
    const scroller = body.current;
    const inBody = Boolean(scroller && target instanceof Node && scroller.contains(target));
    gesture.current = {
      start: clientY,
      last: clientY,
      at: performance.now(),
      velocity: 0,
      dragging: !inBody,
      canDrag: !inBody || (scroller?.scrollTop ?? 0) <= 0,
    };
  }

  /** Moves the drawer with the finger. True while it is the drawer that moves. */
  function move(clientY: number) {
    const now = gesture.current;
    if (!now) return false;
    if (!now.dragging) {
      const delta = clientY - now.start;
      if (delta === 0) return false;
      // Pushing up, or pulling a scrolled body, scrolls instead.
      if (!now.canDrag || delta < 0) {
        gesture.current = null;
        return false;
      }
      now.dragging = true;
      now.start = clientY;
    }
    const time = performance.now();
    now.velocity = (clientY - now.last) / Math.max(1, time - now.at);
    now.last = clientY;
    now.at = time;
    const offset = clientY - now.start;
    // Down follows the finger, up gives a little and holds.
    y.set(offset >= 0 ? offset : -Math.sqrt(-offset) * 2.5);
    return true;
  }

  function end() {
    const now = gesture.current;
    gesture.current = null;
    if (!now?.dragging) return;
    const height = panel.current?.offsetHeight ?? 400;
    const pulled = y.get();
    if (pulled > height * 0.3 || (now.velocity > 0.45 && pulled > 12)) onClose();
    else animate(y, 0, { duration: 0.25, ease: EASE });
  }

  // Touch goes through listeners of our own, so a pull can stop the page
  // from scrolling before the browser takes the gesture.
  useEffect(() => {
    const node = panel.current;
    if (!open || !drawer || !node) return;
    const start = (event: TouchEvent) => {
      const target = event.target as Element | null;
      if (event.touches.length !== 1 || target?.closest(KEEPS_TOUCH)) return;
      begin(event.touches[0].clientY, target);
    };
    const moving = (event: TouchEvent) => {
      if (move(event.touches[0].clientY) && event.cancelable) event.preventDefault();
    };
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchmove", moving, { passive: false });
    node.addEventListener("touchend", end);
    node.addEventListener("touchcancel", end);
    return () => {
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchmove", moving);
      node.removeEventListener("touchend", end);
      node.removeEventListener("touchcancel", end);
    };
    // begin, move and end read refs only, so the listeners stay put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, drawer]);

  function mouseDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawer || event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest(KEEPS_MOUSE) || body.current?.contains(target)) return;
    event.preventDefault();
    begin(event.clientY, target);
    const moving = (next: PointerEvent) => move(next.clientY);
    const up = () => {
      end();
      window.removeEventListener("pointermove", moving);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", moving);
    window.addEventListener("pointerup", up);
  }

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="drawer"
            className={cx("fixed inset-0 z-[80] flex justify-center", drawer ? "items-end" : "items-center p-4")}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
              onPointerDown={onClose}
            >
              <motion.div className="absolute inset-0 bg-black/40" style={{ opacity: drawer ? dim : 1 }} />
            </motion.div>

            {/* The outer layer comes and goes, the inner one follows the finger. */}
            <motion.div
              className={cx("relative w-full", drawer ? "max-w-[640px]" : "max-w-[460px]")}
              initial={drawer ? { y: "100%" } : { opacity: 0, scale: 0.96 }}
              animate={
                drawer
                  ? { y: 0, transition: { duration: 0.25, ease: EASE } }
                  : { opacity: 1, scale: 1, transition: { duration: 0.25, ease: EASE } }
              }
              exit={
                drawer
                  ? { y: "100%", transition: { duration: 0.15, ease: EASE } }
                  : { opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: EASE } }
              }
            >
              <motion.div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${id}title`}
                aria-describedby={description != null ? `${id}description` : undefined}
                tabIndex={-1}
                onKeyDown={trap}
                onPointerDown={mouseDown}
                style={{ y: drawer ? y : 0 }}
                className={cx(
                  "relative flex flex-col overflow-hidden border border-border bg-card shadow-float outline-none",
                  drawer
                    ? "max-h-[92dvh] rounded-t-[28px] border-b-0 pb-[env(safe-area-inset-bottom)]"
                    : "max-h-[85dvh] rounded-panel",
                  className,
                )}
              >
                <div className={cx("shrink-0", drawer && "cursor-grab select-none active:cursor-grabbing")}>
                  {drawer && (
                    <div className="flex justify-center pt-2.5 pb-1">
                      <span className="h-[5px] w-9 rounded-full bg-control-active" />
                    </div>
                  )}
                  <div className={cx("flex items-start gap-3 px-6", drawer ? "pt-3" : "pt-6")}>
                    <div className={cx("min-w-0 flex-1", drawer && "text-center")}>
                      <h2 id={`${id}title`} className="text-[17px] leading-snug font-medium">
                        {title}
                      </h2>
                      {description != null && (
                        <p id={`${id}description`} className="mt-1 text-[14px] leading-relaxed text-muted">
                          {description}
                        </p>
                      )}
                    </div>
                    {/* A phone closes it with a pull, so the button is there for screen readers only. */}
                    <IconButton
                      label="Close"
                      icon={Cancel01Icon}
                      onClick={onClose}
                      className={cx("-mt-1.5 -mr-2", drawer && "sr-only focus:not-sr-only")}
                    />
                  </div>
                </div>
                <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-5 pb-6">
                  {children}
                </div>
                {footer && (
                  <div
                    className={cx(
                      "flex shrink-0 gap-2 border-t border-border px-6 py-4",
                      drawer ? "flex-col" : "flex-col-reverse sm:flex-row sm:justify-end",
                    )}
                  >
                    {footer}
                  </div>
                )}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
