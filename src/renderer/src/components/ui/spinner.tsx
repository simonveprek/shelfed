"use client";

import { motion } from "framer-motion";
import { cx } from "./cx";

const SIZE = { sm: 14, md: 18, lg: 24 } as const;

/**
 * Something is working. An arc turns around a faint ring, the same marker
 * a running step has in a Fragms plan. It takes the colour of its text.
 */
export function Spinner({
  size = "md",
  label = "Loading",
  className,
}: {
  size?: "sm" | "md" | "lg";
  /** Read out in place of the drawing. */
  label?: string;
  className?: string;
}) {
  const box = SIZE[size];
  return (
    <span
      role="status"
      aria-label={label}
      className={cx("relative inline-flex shrink-0", className)}
      style={{ width: box, height: box }}
    >
      <svg width={box} height={box} viewBox="0 0 18 18" aria-hidden="true">
        <circle
          cx="9"
          cy="9"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.14}
          strokeWidth="2"
        />
      </svg>
      {/* The arc turns as a whole, around the middle of the circle. */}
      <motion.svg
        width={box}
        height={box}
        viewBox="0 0 18 18"
        aria-hidden="true"
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx="9"
          cy="9"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="12 32"
        />
      </motion.svg>
    </span>
  );
}
