"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cx, EASE } from "./cx";

/** A chevron that flips over, the way an accordion opens. */
export function Chevron({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <motion.svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      animate={{ scaleY: open ? -1 : 1 }}
      transition={{ duration: 0.25, ease: EASE }}
      className={className}
    >
      <path
        d="M3 4.5 6 7.5 9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </motion.svg>
  );
}

/**
 * A title that folds what is under it away. It grows on its grid track in
 * 250ms, both ways, with its padding inside so it closes all the way.
 */
export function Accordion({
  title,
  hint,
  defaultOpen = false,
  open: held,
  onOpenChange,
  look = "row",
  className,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  defaultOpen?: boolean;
  /** Holds it open or shut from outside. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** A roomy row for pages, or a tight one for side panels. */
  look?: "row" | "compact";
  className?: string;
  children: ReactNode;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = held ?? own;
  const toggle = () => {
    setOwn(!open);
    onOpenChange?.(!open);
  };
  const compact = look === "compact";

  return (
    <div className={cx("border-b border-border last:border-b-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={cx(
          "group/accordion flex w-full cursor-pointer items-center justify-between gap-4 text-left",
          compact ? "px-5 py-4" : "py-4",
        )}
      >
        <span className="min-w-0">
          <span
            className={cx(
              "block font-medium transition-colors duration-150",
              compact
                ? cx(
                    "text-label",
                    !open && "text-muted group-hover/accordion:text-foreground",
                  )
                : "text-[15px]",
            )}
          >
            {title}
          </span>
          {hint && (
            <span className="mt-0.5 block text-label text-muted">{hint}</span>
          )}
        </span>
        <span
          className={cx(
            "flex shrink-0 items-center justify-center text-muted",
            !compact && "size-7 rounded-full bg-control",
          )}
        >
          <Chevron open={open} />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-250 ease-smooth"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div
          className={cx(
            "min-h-0 overflow-hidden transition-opacity duration-250",
            open ? "opacity-100" : "opacity-0",
          )}
          inert={!open}
        >
          <div className={compact ? "flex flex-col gap-4 px-5 pb-5" : "pb-5"}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
