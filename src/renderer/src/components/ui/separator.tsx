import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * A hairline between things. Across by default, or upright between items in
 * a row. A label sits in the middle of a horizontal one, like or.
 */
export function Separator({
  orientation = "horizontal",
  label,
  decorative = true,
  className,
}: {
  orientation?: "horizontal" | "vertical";
  /** A word in the middle. Horizontal only. */
  label?: ReactNode;
  /** Only for looks, so it is skipped by screen readers. */
  decorative?: boolean;
  className?: string;
}) {
  const semantics = decorative
    ? { role: "none" as const }
    : { role: "separator" as const, "aria-orientation": orientation };

  if (orientation === "vertical")
    return (
      <span
        {...semantics}
        className={cx("w-px shrink-0 self-stretch bg-border", className)}
      />
    );

  if (label != null)
    return (
      <div
        {...semantics}
        className={cx("flex w-full items-center gap-3", className)}
      >
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-caption text-muted">{label}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );

  return (
    <div {...semantics} className={cx("h-px w-full shrink-0 bg-border", className)} />
  );
}
