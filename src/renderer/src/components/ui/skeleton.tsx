import type { CSSProperties } from "react";
import { cx } from "./cx";

const SHAPE = {
  block: "rounded-item",
  line: "h-3 rounded-full",
  circle: "aspect-square rounded-full",
} as const;

// A faint band of the foreground sweeps across, on the shimmer keyframes in
// globals.css. It holds still for anyone who asks for less motion.
const SWEEP: CSSProperties = {
  backgroundImage:
    "linear-gradient(110deg, transparent 35%, color-mix(in oklab, var(--foreground) 7%, transparent) 50%, transparent 65%)",
  backgroundSize: "250% 100%",
  backgroundPosition: "100% 0",
  backgroundRepeat: "no-repeat",
};

/**
 * A stand in for content that is on its way, in the shape it will have. A
 * soft light passes over it, it never pulses.
 */
export function Skeleton({
  shape = "block",
  width,
  height,
  className,
}: {
  shape?: "block" | "line" | "circle";
  /** Pixels, or any length like "60%". */
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block shrink-0 bg-control animate-[shimmer_1.8s_linear_infinite] motion-reduce:animate-none",
        SHAPE[shape],
        className,
      )}
      style={{ ...SWEEP, width, height }}
    />
  );
}

/** A few lines of text on their way, the last one shorter. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cx("flex flex-col gap-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          shape="line"
          width={i === lines - 1 && lines > 1 ? "60%" : "100%"}
        />
      ))}
    </span>
  );
}
