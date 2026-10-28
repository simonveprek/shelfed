"use client";

import type { ComponentProps, ReactNode } from "react";
import { SquareLock02Icon } from "@hugeicons/core-free-icons";
import { cx } from "./cx";
import { Icon, type IconLike } from "./icon";

/**
 * A pill to pick. Each one stands on its own, the picked one lifts a shade,
 * so a row of them reads as filters or options.
 */
export function Chip({
  active = false,
  onClick,
  icon,
  count,
  locked = false,
  size = "md",
  role,
  className,
  children,
  ...rest
}: Omit<ComponentProps<"button">, "role" | "onClick" | "children"> & {
  active?: boolean;
  onClick?: () => void;
  icon?: IconLike;
  /** A number after the words, like how many it holds. */
  count?: number;
  /** Shown with a lock. A click still runs, so it can explain why. */
  locked?: boolean;
  size?: "sm" | "md";
  role?: "radio" | "checkbox";
  className?: string;
  /** Leave out for a chip with only its icon, and give it an aria-label. */
  children?: ReactNode;
}) {
  return (
    <button
      {...rest}
      type="button"
      role={role}
      aria-pressed={role ? undefined : active}
      aria-checked={role ? active : undefined}
      onClick={onClick}
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-8 px-3 text-label" : "h-9 px-3.5 text-label",
        active
          ? "bg-control-active text-foreground shadow-[inset_0_0_0_1px_var(--line-strong)]"
          : "bg-control/70 text-muted shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground",
        className,
      )}
    >
      {icon != null && <Icon icon={icon} size={14} />}
      {children}
      {count != null && (
        <span className="text-caption tabular-nums opacity-55">{count}</span>
      )}
      {locked && (
        <Icon icon={SquareLock02Icon} size={12} className="opacity-60" />
      )}
    </button>
  );
}

export type ChipOption<T extends string> = {
  id: T;
  label: ReactNode;
  icon?: IconLike;
  count?: number;
  locked?: boolean;
};

/** A row of chips where one is picked. */
export function ChipGroup<T extends string>({
  value,
  options,
  onChange,
  onLocked,
  label,
  size,
  className,
}: {
  value: T;
  options: ChipOption<T>[];
  onChange: (value: T) => void;
  /** Runs instead of onChange for a locked chip. */
  onLocked?: (value: T) => void;
  /** What the group picks, read out by screen readers. */
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("flex flex-wrap gap-1.5", className)}
    >
      {options.map((option) => (
        <Chip
          key={option.id}
          role="radio"
          active={value === option.id}
          icon={option.icon}
          count={option.count}
          locked={option.locked}
          size={size}
          onClick={() =>
            option.locked && onLocked
              ? onLocked(option.id)
              : onChange(option.id)
          }
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}
