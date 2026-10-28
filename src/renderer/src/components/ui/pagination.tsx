"use client";

import { useId } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "./button";
import { cx, EASE } from "./cx";

type Slot = number | "start" | "end";

// Container widths to fold below, smallest first. Written out in full so
// Tailwind finds every class.
const FOLDS: [number, { full: string; folded: string }][] = [
  [256, { full: "@max-3xs:hidden", folded: "@max-3xs:block" }],
  [288, { full: "@max-2xs:hidden", folded: "@max-2xs:block" }],
  [320, { full: "@max-xs:hidden", folded: "@max-xs:block" }],
  [384, { full: "@max-sm:hidden", folded: "@max-sm:block" }],
  [448, { full: "@max-md:hidden", folded: "@max-md:block" }],
  [512, { full: "@max-lg:hidden", folded: "@max-lg:block" }],
  [576, { full: "@max-xl:hidden", folded: "@max-xl:block" }],
  [672, { full: "@max-2xl:hidden", folded: "@max-2xl:block" }],
  [768, { full: "@max-3xl:hidden", folded: "@max-3xl:block" }],
  [896, { full: "@max-4xl:hidden", folded: "@max-4xl:block" }],
];

// The first and last page, the pages around the current one, and a gap
// where pages are left out. Always the same number of slots, so it holds still.
function slots(page: number, count: number, siblings: number): Slot[] {
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const total = siblings * 2 + 5;
  if (count <= total) return range(1, count);
  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, count);
  const gapLeft = left > 3;
  const gapRight = right < count - 2;
  const edge = siblings * 2 + 3;
  if (!gapLeft) return [...range(1, edge), "end", count];
  if (!gapRight) return [1, "start", ...range(count - edge + 1, count)];
  return [1, "start", ...range(left, right), "end", count];
}

/**
 * Pages of a long list. The arrows step one page, the numbers jump, and the
 * current page sits on a pill that slides to it. Give it onChange to switch
 * in place, or href to make every page a link. When the numbers do not fit
 * its width, it folds to the arrows and where you are.
 */
export function Pagination({
  page,
  count,
  onChange,
  href,
  align = "center",
  siblings = 1,
  size = "md",
  compact = false,
  labels = false,
  label = "Pages",
  className,
}: {
  /** The current page, from 1. */
  page: number;
  /** How many pages there are. */
  count: number;
  onChange?: (page: number) => void;
  /** The address of a page, to make them links. */
  href?: (page: number) => string;
  /** Where the row sits in its width. */
  align?: "start" | "center" | "end";
  /** How many pages show on each side of the current one. */
  siblings?: number;
  size?: "sm" | "md";
  /** Only the arrows and where you are, at every width. */
  compact?: boolean;
  /** Previous and Next in words beside the arrows. */
  labels?: boolean;
  label?: string;
  className?: string;
}) {
  const glide = useId();
  const go = (to: number) => onChange?.(Math.min(count, Math.max(1, to)));
  const cell = size === "sm" ? "h-8 min-w-8 text-label" : "h-10 min-w-10 text-[14px]";
  const shown = slots(page, count, Math.max(0, siblings));

  // How wide the full row is, to pick the container width it folds below.
  const px = size === "sm" ? 32 : 40;
  const arrowPx = labels ? (size === "sm" ? 100 : 118) : px;
  const need = shown.length * px + arrowPx * 2 + (shown.length + 1) * 4;
  const fold = (FOLDS.find(([width]) => width >= need) ??
    FOLDS[FOLDS.length - 1])[1];

  const arrow = (to: number, next: boolean) => {
    const disabled = next ? page >= count : page <= 1;
    const words = next ? "Next" : "Previous";
    return (
      <Button
        variant="ghost"
        size={size}
        square={!labels}
        icon={next ? undefined : ArrowLeft01Icon}
        iconAfter={next ? ArrowRight01Icon : undefined}
        href={href && !disabled ? href(to) : undefined}
        onClick={href ? undefined : () => go(to)}
        disabled={disabled}
        aria-label={labels ? undefined : `${words} page`}
        title={labels ? undefined : `${words} page`}
      >
        {labels && words}
      </Button>
    );
  };

  return (
    <nav aria-label={label} className={cx("@container w-full", className)}>
      <ul
        className={cx(
          "flex items-center gap-1",
          align === "center" && "justify-center",
          align === "end" && "justify-end",
        )}
      >
        <li>{arrow(page - 1, false)}</li>
        {!compact &&
          shown.map((slot) => {
            if (typeof slot !== "number")
              return (
                <li
                  key={slot}
                  aria-hidden="true"
                  className={cx(
                    "flex items-center justify-center text-muted select-none",
                    cell,
                    fold.full,
                  )}
                >
                  …
                </li>
              );
            const current = slot === page;
            const classes = cx(
              "relative flex cursor-pointer items-center justify-center rounded-full px-2 font-medium tabular-nums transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
              cell,
              current
                ? "text-foreground"
                : "text-muted hover:bg-control hover:text-foreground",
            );
            const inner = (
              <>
                {current && (
                  <motion.span
                    layoutId={glide}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-control"
                    transition={{ duration: 0.25, ease: EASE }}
                  />
                )}
                <span className="relative">{slot}</span>
              </>
            );
            return (
              <li key={slot} className={fold.full}>
                {href ? (
                  <Link
                    href={href(slot)}
                    aria-current={current ? "page" : undefined}
                    aria-label={`Page ${slot}`}
                    className={classes}
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-current={current ? "page" : undefined}
                    aria-label={`Page ${slot}`}
                    onClick={() => go(slot)}
                    className={classes}
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        <li
          aria-live="polite"
          className={cx(
            "px-2 text-label whitespace-nowrap text-muted tabular-nums",
            !compact && ["hidden", fold.folded].join(" "),
          )}
        >
          <span className="text-foreground">{page}</span> of {count}
        </li>
        <li>{arrow(page + 1, true)}</li>
      </ul>
    </nav>
  );
}
