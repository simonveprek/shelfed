"use client";

import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cx, EASE } from "./cx";
import { Icon, type IconLike } from "./icon";

export type SegmentOption<T extends string> = {
  id: T;
  label: ReactNode;
  icon?: IconLike;
};

/**
 * A few options on one track, with the picked one on a pill that slides to
 * it. For switching views, tabs and modes.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
  block = false,
  tabs = false,
  className,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  /** Stretches across its container, each option an equal share. */
  block?: boolean;
  /** Acts as tabs for a panel, rather than a setting. */
  tabs?: boolean;
  className?: string;
}) {
  const glide = useId();
  return (
    <div
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      className={cx(
        "rounded-full bg-control p-0.5",
        block ? "flex w-full" : "inline-flex",
        className,
      )}
    >
      {options.map((option) => {
        const on = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role={tabs ? "tab" : "radio"}
            aria-selected={tabs ? on : undefined}
            aria-checked={tabs ? undefined : on}
            onClick={() => onChange(option.id)}
            className={cx(
              "relative flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-150",
              size === "sm" ? "h-7 px-3 text-caption" : "h-8 px-3.5 text-label",
              block && "flex-1",
              on ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {on && (
              <motion.span
                layoutId={glide}
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_0_0_1px_var(--border)] dark:bg-control-active"
                transition={{ duration: 0.25, ease: EASE }}
              />
            )}
            {option.icon != null && (
              <span className="relative flex">
                <Icon icon={option.icon} size={14} />
              </span>
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
