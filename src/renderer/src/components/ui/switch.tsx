"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Badge } from "./badge";
import { cx } from "./cx";

/**
 * The toggle itself. The thumb travels with a small overshoot and settles,
 * so it feels pushed rather than slid.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("cursor-pointer disabled:opacity-45", className)}
    >
      <Track checked={checked} />
    </button>
  );
}

function Track({ checked, faded }: { checked: boolean; faded?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative block h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-250 ease-smooth",
        checked
          ? "bg-primary"
          : "bg-control shadow-[inset_0_0_0_1px_var(--line-strong)]",
        faded && "opacity-45",
      )}
    >
      <motion.span
        className={cx(
          "absolute top-[3px] left-[3px] size-4 rounded-full shadow-sm",
          checked ? "bg-primary-ink" : "bg-muted",
        )}
        animate={{ x: checked ? 16 : 0 }}
        transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
      />
    </span>
  );
}

/** A setting that is on or off, as a whole row you can press. */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  locked = false,
  onLocked,
  disabled = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Part of Pro. A press runs onLocked instead. */
  locked?: boolean;
  onLocked?: () => void;
  /** Shown but can't be pressed. */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => (locked ? onLocked?.() : onChange(!checked))}
      className="flex w-full cursor-pointer items-center justify-between gap-3 text-left transition-opacity duration-150 disabled:cursor-default disabled:opacity-45"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-label">
          {label}
          {locked && <Badge tone="strong">Pro</Badge>}
        </span>
        {hint && (
          <span className="mt-0.5 block text-caption text-muted">{hint}</span>
        )}
      </span>
      <Track checked={checked} faded={locked} />
    </button>
  );
}
