"use client";

import { useId, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cx, EASE } from "./cx";
import { useField } from "./field";

const POP = [0.34, 1.56, 0.64, 1] as const;

export type RadioOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** A quieter line under the label. */
  description?: ReactNode;
  /** Something on the right, like a price. */
  meta?: ReactNode;
  disabled?: boolean;
};

/**
 * One choice out of a few, all in view. Real radios underneath, so the
 * arrow keys move the choice and it posts with a form. As cards, the ink
 * outline glides to the picked one.
 */
export function RadioGroup<T extends string>({
  options,
  value: controlled,
  defaultValue,
  onChange,
  variant = "list",
  name,
  label,
  disabled = false,
  invalid,
  required,
  className,
}: {
  options: RadioOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** Plain rows, or a card for each choice. */
  variant?: "list" | "card";
  /** Posts the picked value under this name with a form. */
  name?: string;
  /** Read out for the group. A Field around it names it instead. */
  label?: string;
  disabled?: boolean;
  /** Draws it as wrong, like when nothing is picked yet. */
  invalid?: boolean;
  required?: boolean;
  className?: string;
}) {
  const field = useField();
  const [own, setOwn] = useState<T | undefined>(defaultValue);
  const picked = controlled ?? own;
  const auto = useId();
  const group = name ?? auto;
  const glide = `${auto}-glide`;
  const bad = invalid ?? field?.invalid ?? false;
  const cards = variant === "card";

  return (
    <div
      role="radiogroup"
      aria-label={field ? undefined : label}
      aria-labelledby={field?.labelId}
      aria-describedby={field?.describedBy}
      aria-invalid={bad || undefined}
      aria-disabled={disabled || undefined}
      className={cx("grid", cards ? "gap-2" : "gap-3", className)}
    >
      {options.map((option, index) => {
        const on = option.value === picked;
        const off = disabled || option.disabled;
        const descriptionId = option.description ? `${auto}-${index}-description` : undefined;
        return (
          <label
            key={option.value}
            className={cx(
              "group/radio relative flex items-start gap-3 text-label select-none",
              off ? "cursor-not-allowed opacity-45" : "cursor-pointer",
              cards &&
                "rounded-field border bg-well p-4 transition-[border-color,background-color] duration-150 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-foreground/10",
              cards && (bad ? "border-danger/50" : "border-border"),
              cards && !on && !off && "hover:border-line-strong",
            )}
          >
            <input
              type="radio"
              name={group}
              value={option.value}
              checked={on}
              disabled={off}
              required={required}
              aria-describedby={descriptionId}
              onChange={() => {
                if (controlled === undefined) setOwn(option.value);
                onChange?.(option.value);
              }}
              className="peer sr-only"
            />
            <Dot on={on} invalid={bad} focusRing={!cards} />
            <span className="min-w-0 flex-1">
              <span className="block">{option.label}</span>
              {option.description && (
                <span id={descriptionId} className="mt-0.5 block text-caption text-muted">
                  {option.description}
                </span>
              )}
            </span>
            {option.meta != null && <span className="shrink-0 text-muted">{option.meta}</span>}
            {cards && on && (
              <motion.span
                layoutId={glide}
                aria-hidden="true"
                className="pointer-events-none absolute -inset-px rounded-field border border-foreground"
                transition={{ duration: 0.25, ease: EASE }}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

function Dot({ on, invalid, focusRing }: { on: boolean; invalid: boolean; focusRing: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative flex size-[18px] shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow,transform] duration-250 ease-smooth group-active/radio:scale-90",
        focusRing && "peer-focus-visible:ring-4 peer-focus-visible:ring-foreground/10",
        on
          ? "bg-primary"
          : invalid
            ? "bg-control shadow-[inset_0_0_0_1px_var(--danger)]"
            : "bg-control shadow-[inset_0_0_0_1px_var(--line-strong)] group-hover/radio:bg-control-hover",
      )}
    >
      <motion.span
        className="size-1.5 rounded-full bg-primary-ink"
        initial={false}
        animate={on ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={on ? { duration: 0.35, ease: POP } : { duration: 0.15, ease: EASE }}
      />
    </span>
  );
}
