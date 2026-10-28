"use client";

import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cx, EASE } from "./cx";

const HEIGHT = { sm: "h-1", md: "h-1.5", lg: "h-2" } as const;

const share = (value: number, max: number) =>
  max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

/**
 * How far along something is, as an ink bar on a control track. The bar
 * moves in 250ms when the value changes. Without a value it is
 * indeterminate, and a short piece of ink travels along the track.
 */
export function Progress({
  value,
  max = 100,
  indeterminate = false,
  size = "md",
  label,
  showValue = false,
  "aria-label": ariaLabel,
  className,
}: {
  value?: number;
  max?: number;
  /** For work with no known end. Also on when there is no value. */
  indeterminate?: boolean;
  size?: "sm" | "md" | "lg";
  /** A line over the bar, like the file being sent. */
  label?: ReactNode;
  /** The percentage on the right of the label line. */
  showValue?: boolean;
  /** What it measures, when there is no visible label. */
  "aria-label"?: string;
  className?: string;
}) {
  const id = useId();
  const unknown = indeterminate || value == null;
  const percent = unknown ? 0 : share(value, max);

  return (
    <div className={cx("w-full", className)}>
      {(label != null || (showValue && !unknown)) && (
        <div className="mb-2 flex items-baseline justify-between gap-3 text-label">
          <span id={`${id}-label`} className="min-w-0 truncate">
            {label}
          </span>
          {showValue && !unknown && (
            <span className="shrink-0 text-muted tabular-nums">
              {Math.round(percent)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-labelledby={label != null ? `${id}-label` : undefined}
        aria-label={label != null ? undefined : ariaLabel}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={unknown ? undefined : value}
        aria-busy={unknown || undefined}
        className={cx(
          "relative w-full overflow-hidden rounded-full bg-control",
          HEIGHT[size],
        )}
      >
        {unknown ? (
          <motion.span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary"
            initial={{ x: "-100%" }}
            animate={{ x: "250%" }}
            transition={{
              duration: 1.4,
              ease: [0.65, 0, 0.35, 1],
              repeat: Infinity,
            }}
          />
        ) : (
          <motion.span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.25, ease: EASE }}
          />
        )}
      </div>
    </div>
  );
}

const RING = { sm: 16, md: 24, lg: 48 } as const;

/**
 * Progress as a ring that fills clockwise. Small ones sit beside a line of
 * text, the large one can show the percentage in its middle.
 */
export function ProgressRing({
  value,
  max = 100,
  size = "md",
  thickness,
  showValue = false,
  "aria-label": ariaLabel,
  className,
}: {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  /** Stroke width in pixels. Scales with the size by default. */
  thickness?: number;
  /** The percentage in the middle. Only the large ring has room for it. */
  showValue?: boolean;
  "aria-label"?: string;
  className?: string;
}) {
  const box = RING[size];
  const stroke = thickness ?? (size === "lg" ? 4 : 2.5);
  const radius = (box - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const percent = share(value, max);

  return (
    <span
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center text-foreground",
        className,
      )}
      style={{ width: box, height: box }}
    >
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.14}
          strokeWidth={stroke}
        />
        <motion.circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          initial={false}
          animate={{
            strokeDashoffset: length * (1 - percent / 100),
            // A round cap would leave a dot at zero.
            opacity: percent > 0 ? 1 : 0,
          }}
          transition={{ duration: 0.25, ease: EASE }}
        />
      </svg>
      {showValue && size === "lg" && (
        <span className="absolute text-caption font-medium tabular-nums">
          {Math.round(percent)}
        </span>
      )}
    </span>
  );
}
