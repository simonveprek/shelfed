"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx, EASE } from "./cx";

const POP = [0.34, 1.56, 0.64, 1] as const;

export type CheckedState = boolean | "indeterminate";

/**
 * A box to tick. The tick draws itself in with a small overshoot, like the
 * Switch thumb. It is a real checkbox underneath, so it posts with a form
 * and Space toggles it.
 */
export function Checkbox({
  checked: controlled,
  defaultChecked = false,
  onChange,
  label,
  description,
  name,
  value = "on",
  disabled = false,
  invalid = false,
  required,
  id,
  "aria-label": ariaLabel,
  className,
}: {
  /** On, off, or partly on for a parent of other boxes. */
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  onChange?: (checked: boolean) => void;
  /** Words beside the box. Pressing them toggles it too. */
  label?: ReactNode;
  /** A quieter line under the label. */
  description?: ReactNode;
  /** Posts value under this name with a form while it is on. */
  name?: string;
  value?: string;
  disabled?: boolean;
  /** Draws it as wrong, like terms that must be agreed to. */
  invalid?: boolean;
  required?: boolean;
  id?: string;
  /** Needed when there is no label. */
  "aria-label"?: string;
  className?: string;
}) {
  const [own, setOwn] = useState<CheckedState>(defaultChecked);
  const state = controlled ?? own;
  const input = useRef<HTMLInputElement>(null);
  const auto = useId();
  const descriptionId = description ? `${id ?? auto}-description` : undefined;

  // Partly on only exists as a DOM property, not an attribute.
  useLayoutEffect(() => {
    if (input.current) input.current.indeterminate = state === "indeterminate";
  }, [state]);

  return (
    <label
      className={cx(
        "group/checkbox relative inline-flex items-start gap-2.5 text-label select-none",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        className,
      )}
    >
      <input
        ref={input}
        id={id}
        type="checkbox"
        name={name}
        value={value}
        checked={state === true}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={descriptionId}
        onChange={(event) => {
          if (controlled === undefined) setOwn(event.target.checked);
          onChange?.(event.target.checked);
        }}
        className="peer sr-only"
      />
      <Box state={state} invalid={invalid} />
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block">{label}</span>}
          {description && (
            <span id={descriptionId} className="mt-0.5 block text-caption text-muted">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}

function Box({ state, invalid }: { state: CheckedState; invalid: boolean }) {
  const on = state !== false;
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative flex size-[18px] shrink-0 items-center justify-center rounded-md transition-[background-color,box-shadow,transform] duration-250 ease-smooth group-active/checkbox:scale-90",
        "peer-focus-visible:ring-4 peer-focus-visible:ring-foreground/10",
        on
          ? "bg-primary text-primary-ink"
          : invalid
            ? "bg-control shadow-[inset_0_0_0_1px_var(--danger)]"
            : "bg-control shadow-[inset_0_0_0_1px_var(--line-strong)] group-hover/checkbox:bg-control-hover",
      )}
    >
      <AnimatePresence initial={false}>
        {on && (
          <motion.svg
            key={state === "indeterminate" ? "dash" : "tick"}
            viewBox="0 0 18 18"
            fill="none"
            className="absolute size-[18px]"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { duration: 0.35, ease: POP } }}
            exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15, ease: EASE } }}
          >
            <motion.path
              d={state === "indeterminate" ? "M5.5 9h7" : "M5 9.4l2.6 2.6L13 6.6"}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1, transition: { duration: 0.25, ease: EASE, delay: 0.05 } }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </span>
  );
}
