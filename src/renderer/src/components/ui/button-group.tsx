import type { ReactNode } from "react";
import { cx } from "./cx";

// The ends stay round and the joins go flat, on the buttons themselves and on
// a button one level in, like the trigger a Menu wraps.
const JOIN =
  "[&>:not(:first-child)]:rounded-l-none! [&>:not(:last-child)]:rounded-r-none! [&>:not(:first-child)>button]:rounded-l-none! [&>:not(:last-child)>button]:rounded-r-none!";

/**
 * Buttons joined into one pill. Secondary buttons part with a thin gap,
 * outline buttons share one line around them with a hairline between.
 * Give it the same variant as the buttons inside.
 */
export function ButtonGroup({
  label,
  variant = "secondary",
  className,
  children,
}: {
  /** What the buttons are for, read out by screen readers. */
  label: string;
  variant?: "secondary" | "outline";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        "inline-flex items-stretch",
        JOIN,
        variant === "secondary" && "gap-px",
        variant === "outline" &&
          "relative rounded-full after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_0_0_1px_var(--line-strong)] [&>*]:shadow-none! [&>*>button]:shadow-none! [&>*+*]:border-l [&>*+*]:border-line-strong",
        className,
      )}
    >
      {children}
    </div>
  );
}
