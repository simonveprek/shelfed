"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar03Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Chevron } from "./accordion";
import { Calendar, type DateRange } from "./calendar";
import { cx, EASE } from "./cx";
import { Icon } from "./icon";
import { Portal } from "./portal";

type Shared = {
  /** What it picks, for screen readers. */
  label: string;
  placeholder?: string;
  /** Writes the date and names the calendar, like "en-GB" or "en-US". */
  locale?: string;
  /** How the date is written in the field. */
  format?: Intl.DateTimeFormatOptions;
  /** Days that cannot be picked, like weekends. */
  isDateDisabled?: (date: Date) => boolean;
  min?: Date;
  max?: Date;
  /** A small cross in the field that empties it. */
  clearable?: boolean;
  size?: "sm" | "md";
  /** Posts the day as 2026-10-04 with a plain form. A range posts two. */
  name?: string;
  disabled?: boolean;
  className?: string;
};

type Single = {
  mode?: "single";
  value: Date | null;
  onChange: (date: Date | null) => void;
};

type Range = {
  mode: "range";
  value: DateRange;
  onChange: (range: DateRange) => void;
};

export type DatePickerProps = Shared & (Single | Range);

type Place = { left: number; top?: number; bottom?: number; above: boolean };

const FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

const iso = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

/**
 * A field that shows a date and opens a calendar under it. It floats in
 * 250ms and leaves in 150ms. Picking a day closes it, and a range closes
 * once both ends are in. Escape puts it away.
 */
export function DatePicker(props: DatePickerProps) {
  const {
    label,
    placeholder = props.mode === "range" ? "Pick dates" : "Pick a date",
    locale = "en-GB",
    format = FORMAT,
    isDateDisabled,
    min,
    max,
    clearable = false,
    size = "md",
    name,
    disabled = false,
    className,
  } = props;
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const id = useId();

  const hide = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus({ preventScroll: true });
  };

  // The year is written once when both ends share it.
  let text: string | null = null;
  if (props.mode === "range") {
    const { from, to } = props.value;
    if (from && to) {
      const { year: _year, ...noYear } = format;
      void _year;
      const head = new Intl.DateTimeFormat(
        locale,
        from.getFullYear() === to.getFullYear() ? noYear : format,
      ).format(from);
      text = `${head} to ${new Intl.DateTimeFormat(locale, format).format(to)}`;
    } else if (from)
      text = `From ${new Intl.DateTimeFormat(locale, format).format(from)}`;
  } else if (props.value)
    text = new Intl.DateTimeFormat(locale, format).format(props.value);

  const days =
    props.mode === "range"
      ? [props.value.from, props.value.to].filter((day): day is Date => !!day)
      : props.value
        ? [props.value]
        : [];

  const clear = () => {
    if (props.mode === "range") props.onChange({ from: null, to: null });
    else props.onChange(null);
  };

  // Under the field when there is room, over it when there is not.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box) return;
      // The calendar's own size, until it is there to measure.
      const width = surface.current?.offsetWidth ?? 284;
      const height = surface.current?.offsetHeight ?? 340;
      const above =
        box.bottom + 8 + height > window.innerHeight - 8 &&
        box.top - 8 - height > 8;
      setPlace({
        left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
        top: above ? undefined : box.bottom + 8,
        bottom: above ? window.innerHeight - box.top + 8 : undefined,
        above,
      });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  // A press anywhere else puts it away.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !trigger.current?.contains(target) &&
        !surface.current?.contains(target)
      )
        hide(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  });

  const shared = { isDateDisabled, min, max, locale, autoFocus: true };

  return (
    <div className={cx("relative w-full", className)}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={text ? `${label}, ${text}` : label}
        disabled={disabled}
        onClick={() => (open ? hide() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-field border border-border bg-well pr-3.5 pl-3.5 text-left text-label text-foreground transition-[border-color,background-color] duration-150 outline-none hover:border-line-strong focus-visible:border-line-strong disabled:cursor-default disabled:opacity-45 disabled:hover:border-border",
          open && "border-line-strong",
          size === "sm" ? "h-8" : "h-10",
          clearable && text && "pr-10",
        )}
      >
        <Icon icon={Calendar03Icon} size={15} className="shrink-0 text-muted" />
        <span
          className={cx(
            "min-w-0 flex-1 truncate tabular-nums",
            !text && "text-muted",
          )}
        >
          {text ?? placeholder}
        </span>
        {!(clearable && text) && (
          <Chevron open={open} className="shrink-0 text-muted" />
        )}
      </button>

      {clearable && text && !disabled && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          onClick={clear}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-150 outline-none hover:bg-control hover:text-foreground focus-visible:bg-control focus-visible:text-foreground"
        >
          <Icon icon={Cancel01Icon} size={12} strokeWidth={2.2} />
        </button>
      )}

      {name &&
        days.map((day, i) => (
          <input key={i} type="hidden" name={name} value={iso(day)} />
        ))}

      <Portal>
        <AnimatePresence>
          {open && place && (
            <motion.div
              ref={surface}
              id={id}
              role="dialog"
              aria-label={label}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  hide();
                }
              }}
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (
                  next &&
                  !surface.current?.contains(next) &&
                  !trigger.current?.contains(next)
                )
                  hide(false);
              }}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { duration: 0.25, ease: EASE },
              }}
              exit={{
                opacity: 0,
                scale: 0.98,
                transition: { duration: 0.15, ease: EASE },
              }}
              style={{
                position: "fixed",
                left: place.left,
                top: place.top,
                bottom: place.bottom,
                transformOrigin: place.above ? "bottom left" : "top left",
              }}
              className="z-[90] rounded-[18px] border border-border bg-card p-1.5 shadow-float"
            >
              {props.mode === "range" ? (
                <Calendar
                  {...shared}
                  mode="range"
                  value={props.value}
                  onChange={(range) => {
                    props.onChange(range);
                    if (range.from && range.to) hide();
                  }}
                />
              ) : (
                <Calendar
                  {...shared}
                  value={props.value}
                  onChange={(date) => {
                    props.onChange(date);
                    hide();
                  }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}
