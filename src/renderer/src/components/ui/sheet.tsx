"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  type PanInfo,
} from "framer-motion";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { IconButton } from "./button";
import { cx, EASE } from "./cx";
import { useFocusTrap } from "./dialog";
import { Portal } from "./portal";

type Side = "right" | "left" | "bottom";

const HIDDEN: Record<Side, { x?: string; y?: string }> = {
  right: { x: "105%" },
  left: { x: "-105%" },
  bottom: { y: "105%" },
};

/**
 * A panel that slides in from the right, the left or the bottom, for details
 * and edits that need room. From the bottom it is a drawer with a handle you
 * can drag down to close. Escape and a click on the dimmed page close it.
 */
export function Sheet({
  open,
  onClose,
  side = "right",
  title,
  description,
  footer,
  initialFocus,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: Side;
  title: string;
  description?: ReactNode;
  /** Buttons pinned to the bottom, under the part that scrolls. */
  footer?: ReactNode;
  /** What gets focus when it opens. The panel itself if not set. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  children?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const trap = useFocusTrap(open, panel, initialFocus);
  const drag = useDragControls();
  const id = useId();
  const drawer = side === "bottom";

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  // A short fling or a pull past a third of the way closes it.
  const release = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const height = panel.current?.offsetHeight ?? 400;
    if (info.offset.y > height / 3 || info.velocity.y > 600) onClose();
  };

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="sheet"
            className={cx(
              "fixed inset-0 z-[80] flex p-2",
              side === "right" && "justify-end",
              side === "left" && "justify-start",
              drawer && "items-end justify-center",
            )}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
              onPointerDown={onClose}
            />
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}title`}
              aria-describedby={description != null ? `${id}description` : undefined}
              tabIndex={-1}
              onKeyDown={trap}
              initial={HIDDEN[side]}
              animate={{ x: 0, y: 0, transition: { duration: 0.25, ease: EASE } }}
              exit={{ ...HIDDEN[side], transition: { duration: 0.15, ease: EASE } }}
              drag={drawer ? "y" : false}
              dragControls={drag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 1 }}
              onDragEnd={drawer ? release : undefined}
              className={cx(
                "relative flex flex-col overflow-hidden rounded-panel border border-border bg-card shadow-float outline-none",
                drawer
                  ? "max-h-[85dvh] w-full max-w-[560px]"
                  : "h-full w-full max-w-[420px]",
                className,
              )}
            >
              <div
                className={cx("shrink-0", drawer && "cursor-grab touch-none active:cursor-grabbing")}
                onPointerDown={drawer ? (event) => drag.start(event) : undefined}
              >
                {drawer && (
                  <div className="flex justify-center pt-2.5">
                    <span className="h-1 w-10 rounded-full bg-control-active" />
                  </div>
                )}
                <div className={cx("flex items-start gap-3 px-6", drawer ? "pt-3" : "pt-5")}>
                  <div className="min-w-0 flex-1 pt-1.5">
                    <h2 id={`${id}title`} className="text-[17px] leading-snug font-medium">
                      {title}
                    </h2>
                    {description != null && (
                      <p id={`${id}description`} className="mt-1 text-[14px] leading-relaxed text-muted">
                        {description}
                      </p>
                    )}
                  </div>
                  <IconButton
                    label="Close"
                    icon={Cancel01Icon}
                    onClick={onClose}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="-mr-2"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6">
                {children}
              </div>
              {footer && (
                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
                  {footer}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
