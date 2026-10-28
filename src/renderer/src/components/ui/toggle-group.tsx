"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Chip } from "./chips";
import { cx, EASE } from "./cx";
import { Icon, type IconLike } from "./icon";

export type ToggleOption<T extends string> = {
  id: T;
  /** The words, or what is read out when the group shows only icons. */
  label: string;
  icon?: IconLike;
  disabled?: boolean;
};

type Shared<T extends string> = {
  options: ToggleOption<T>[];
  /** What the group sets, read out by screen readers. */
  label: string;
  /** On one track, or as separate chips. */
  variant?: "track" | "chips";
  size?: "sm" | "md";
  /** Shows only the icons, with the labels read out and shown on hover. */
  iconOnly?: boolean;
  className?: string;
};

type Single<T extends string> = Shared<T> & {
  type?: "single";
  value: T;
  onChange: (value: T) => void;
};

type Multiple<T extends string> = Shared<T> & {
  type: "multiple";
  value: T[];
  onChange: (value: T[]) => void;
};

// The same raised pill Segmented slides between.
const PILL =
  "absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_0_0_1px_var(--border)] dark:bg-control-active";

/**
 * A row of toggles. Single picks one, like text alignment, and the pill
 * slides to it. Multiple turns each on or off, like Bold and Italic. The
 * arrows move along the row.
 */
export function ToggleGroup<T extends string>(
  props: Single<T> | Multiple<T>,
) {
  const {
    options,
    label,
    variant = "track",
    size = "md",
    iconOnly = false,
    className,
  } = props;
  const multiple = props.type === "multiple";
  const glide = useId();
  const row = useRef<HTMLDivElement>(null);

  const isOn = (id: T) =>
    props.type === "multiple" ? props.value.includes(id) : props.value === id;

  const press = (id: T) => {
    if (props.type === "multiple") {
      props.onChange(
        props.value.includes(id)
          ? props.value.filter((item) => item !== id)
          : [...props.value, id],
      );
    } else {
      props.onChange(id);
    }
  };

  // Left and right move along the row. In a single group they pick as well,
  // the way radio buttons do.
  const move = (event: KeyboardEvent) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      row.current?.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
      ) ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowRight"
            ? (at + 1) % items.length
            : (at - 1 + items.length) % items.length;
    const target = items[next];
    target?.focus();
    if (!multiple && target?.dataset.id) press(target.dataset.id as T);
  };

  // In a single group only the picked one is a tab stop.
  const firstUsable = options.find((option) => !option.disabled)?.id;
  const tabStop = (id: T) =>
    multiple ||
    isOn(id) ||
    (!options.some((option) => isOn(option.id)) && id === firstUsable)
      ? 0
      : -1;

  const role = multiple ? undefined : "radio";

  if (variant === "chips") {
    return (
      <div
        ref={row}
        role={multiple ? "group" : "radiogroup"}
        aria-label={label}
        onKeyDown={move}
        className={cx("flex flex-wrap gap-1.5", className)}
      >
        {options.map((option) => (
          <Chip
            key={option.id}
            data-id={option.id}
            active={isOn(option.id)}
            role={role}
            size={size}
            icon={option.icon}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            tabIndex={tabStop(option.id)}
            disabled={option.disabled}
            onClick={() => press(option.id)}
            className={cx(
              iconOnly && "justify-center px-0!",
              iconOnly && (size === "sm" ? "w-8" : "w-9"),
            )}
          >
            {iconOnly ? null : option.label}
          </Chip>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={row}
      role={multiple ? "group" : "radiogroup"}
      aria-label={label}
      onKeyDown={move}
      className={cx(
        "inline-flex max-w-full gap-0.5 rounded-full bg-control p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const on = isOn(option.id);
        return (
          <button
            key={option.id}
            type="button"
            data-id={option.id}
            role={role}
            aria-checked={multiple ? undefined : on}
            aria-pressed={multiple ? on : undefined}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            tabIndex={tabStop(option.id)}
            disabled={option.disabled}
            onClick={() => press(option.id)}
            className={cx(
              "relative flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-[color,transform] duration-150 ease-out active:scale-[0.97] disabled:cursor-default disabled:opacity-40",
              size === "sm" ? "h-7 text-caption" : "h-8 text-label",
              iconOnly
                ? size === "sm"
                  ? "w-7"
                  : "w-8"
                : size === "sm"
                  ? "px-3"
                  : "px-3.5",
              on ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {multiple ? (
              <AnimatePresence initial={false}>
                {on && (
                  <motion.span
                    aria-hidden="true"
                    className={PILL}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      transition: { duration: 0.25, ease: EASE },
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.95,
                      transition: { duration: 0.15, ease: EASE },
                    }}
                  />
                )}
              </AnimatePresence>
            ) : (
              on && (
                <motion.span
                  layoutId={glide}
                  aria-hidden="true"
                  className={PILL}
                  transition={{ duration: 0.25, ease: EASE }}
                />
              )
            )}
            {option.icon != null && (
              <span className="relative flex">
                <Icon icon={option.icon} size={size === "sm" ? 14 : 16} />
              </span>
            )}
            {!iconOnly && <span className="relative">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
