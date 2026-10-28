import type { ReactNode } from "react";
import { cx } from "./cx";

const TONES = {
  neutral: "bg-control text-muted",
  strong: "bg-foreground text-background",
  success: "bg-success/12 text-success",
  danger: "bg-danger/12 text-danger",
};

/**
 * A small word on a pill. Strong for what matters, like Pro. Success and
 * danger for a state, like Paid or Overdue.
 */
export function Badge({
  tone = "neutral",
  size = "sm",
  className,
  children,
}: {
  tone?: "neutral" | "strong" | "success" | "danger";
  /** Small sits beside a name, md stands on its own in a row. */
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full font-semibold",
        size === "md"
          ? "px-2 py-0.5 text-[11.5px] leading-[1.45]"
          : "px-1.5 py-px text-[10.5px] leading-[1.45]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A key to press. */
export function Kbd({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <kbd
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-control px-1.5 font-sans text-[11px] font-medium text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
