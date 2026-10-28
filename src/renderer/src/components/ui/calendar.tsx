"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { IconButton } from "./button";
import { cx, EASE } from "./cx";

export type DateRange = { from: Date | null; to: Date | null };

type Shared = {
  /** The month on show. Leave it out and the calendar keeps its own. */
  month?: Date;
  onMonthChange?: (month: Date) => void;
  /** The first month on show, when month is left out. */
  defaultMonth?: Date;
  /** Days that cannot be picked, like weekends. */
  isDateDisabled?: (date: Date) => boolean;
  /** The earliest day that can be picked. */
  min?: Date;
  /** The latest day that can be picked. */
  max?: Date;
  /** Names months and days, like "en-GB" or "cs-CZ". */
  locale?: string;
  /** Puts the keyboard on the picked day, or today, when it appears. */
  autoFocus?: boolean;
  className?: string;
};

type Single = {
  mode?: "single";
  value: Date | null;
  onChange: (date: Date) => void;
};

type Range = {
  mode: "range";
  value: DateRange;
  onChange: (range: DateRange) => void;
};

export type CalendarProps = Shared & (Single | Range);

const day = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, by: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + by);
const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);
// The same day in another month, or its last day when it is shorter.
const addMonths = (date: Date, by: number) => {
  const last = new Date(date.getFullYear(), date.getMonth() + by + 1, 0);
  return new Date(
    last.getFullYear(),
    last.getMonth(),
    Math.min(date.getDate(), last.getDate()),
  );
};
const same = (a: Date | null | undefined, b: Date | null | undefined) =>
  !!a &&
  !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const key = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
// Monday is the first column.
const column = (date: Date) => (date.getDay() + 6) % 7;

const MOVES: Record<string, (date: Date, shift: boolean) => Date> = {
  ArrowLeft: (date) => addDays(date, -1),
  ArrowRight: (date) => addDays(date, 1),
  ArrowUp: (date) => addDays(date, -7),
  ArrowDown: (date) => addDays(date, 7),
  Home: (date) => addDays(date, -column(date)),
  End: (date) => addDays(date, 6 - column(date)),
  PageUp: (date, shift) => addMonths(date, shift ? -12 : -1),
  PageDown: (date, shift) => addMonths(date, shift ? 12 : 1),
};

/**
 * A month of days, Monday first. Pick one day, or a range with a soft band
 * between its ends. The arrows walk the days, Page Up and Page Down turn
 * the month, and the names come from the browser in any language.
 */
export function Calendar(props: CalendarProps) {
  const {
    month: heldMonth,
    onMonthChange,
    defaultMonth,
    isDateDisabled,
    min,
    max,
    locale = "en-GB",
    autoFocus = false,
    className,
  } = props;
  const anchor =
    props.mode === "range" ? (props.value.from ?? props.value.to) : props.value;

  const [today] = useState(() => day(new Date()));
  const [ownMonth, setOwnMonth] = useState(() =>
    startOfMonth(defaultMonth ?? anchor ?? today),
  );
  const [focus, setFocus] = useState(() => day(anchor ?? today));
  const [hover, setHover] = useState<Date | null>(null);
  const [turn, setTurn] = useState<-1 | 0 | 1>(0);
  const grid = useRef<HTMLDivElement>(null);
  const keyed = useRef(autoFocus);

  const month = heldMonth ? startOfMonth(heldMonth) : ownMonth;
  const tabbable = sameMonth(focus, month)
    ? focus
    : anchor && sameMonth(anchor, month)
      ? day(anchor)
      : sameMonth(today, month)
        ? today
        : month;

  const goTo = (next: Date) => {
    const target = startOfMonth(next);
    if (sameMonth(target, month)) return;
    setTurn(target > month ? 1 : -1);
    if (!heldMonth) setOwnMonth(target);
    onMonthChange?.(target);
  };

  const off = (date: Date) =>
    (min !== undefined && date < day(min)) ||
    (max !== undefined && date > day(max)) ||
    (isDateDisabled?.(date) ?? false);

  // The keyboard follows the focused day after an arrow or on first show.
  useEffect(() => {
    if (!keyed.current) return;
    keyed.current = false;
    grid.current
      ?.querySelector<HTMLElement>(`[data-date="${key(tabbable)}"]`)
      ?.focus({ preventScroll: true });
  });

  const pick = (date: Date) => {
    if (off(date)) return;
    setFocus(date);
    goTo(date);
    if (props.mode !== "range") {
      props.onChange(date);
      return;
    }
    const { from, to } = props.value;
    if (!from || to || date < from) props.onChange({ from: date, to: null });
    else props.onChange({ from, to: date });
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    const next = move(tabbable, event.shiftKey);
    keyed.current = true;
    setFocus(next);
    goTo(next);
  };

  // The band runs from the first end to the second, or to the day under the
  // pointer while the second end is still to pick.
  const from = props.mode === "range" ? props.value.from : null;
  const to =
    props.mode === "range"
      ? (props.value.to ?? (from && hover && hover > from ? hover : null))
      : null;

  const start = addDays(month, -column(month));
  const weeks = Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => addDays(start, row * 7 + col)),
  );
  const title = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: "long" });
  const spoken = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  // 1 January 2024 was a Monday.
  const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i));

  return (
    <div className={cx("w-fit p-2 select-none", className)}>
      <div className="flex items-center justify-between pb-2 pl-2">
        <p aria-live="polite" className="text-[14px] font-medium">
          {title}
        </p>
        <div className="flex gap-0.5">
          <IconButton
            label="Previous month"
            icon={ArrowLeft01Icon}
            disabled={min !== undefined && !(month > startOfMonth(min))}
            onClick={() => goTo(addMonths(month, -1))}
          />
          <IconButton
            label="Next month"
            icon={ArrowRight01Icon}
            disabled={max !== undefined && !(month < startOfMonth(max))}
            onClick={() => goTo(addMonths(month, 1))}
          />
        </div>
      </div>

      <div
        ref={grid}
        role="grid"
        aria-label={title}
        aria-multiselectable={props.mode === "range" || undefined}
        onKeyDown={keys}
        onPointerLeave={() => setHover(null)}
      >
        <div role="row" className="grid grid-cols-[repeat(7,2.25rem)]">
          {names.map((date) => (
            <span
              key={date.getDay()}
              role="columnheader"
              aria-label={weekdayLong.format(date)}
              className="flex h-8 items-center justify-center text-caption text-muted"
            >
              {weekday.format(date)}
            </span>
          ))}
        </div>

        <motion.div
          key={key(month)}
          initial={turn === 0 ? false : { opacity: 0, x: turn * 12 }}
          animate={{
            opacity: 1,
            x: 0,
            transition: { duration: 0.25, ease: EASE },
          }}
          className="flex flex-col gap-1"
        >
          {weeks.map((week) => (
            <div
              key={key(week[0])}
              role="row"
              className="grid grid-cols-[repeat(7,2.25rem)]"
            >
              {week.map((date, col) => {
                const end = same(date, from) || same(date, props.mode === "range" ? props.value.to : null);
                const picked =
                  props.mode === "range" ? end : same(date, props.value);
                const inside = !!from && !!to && date > from && date < to;
                const opensBand = same(date, from) && !!to && !same(from, to) && col < 6;
                const closesBand = same(date, to) && !!from && !same(from, to) && col > 0;
                const disabled = off(date);
                const outside = !sameMonth(date, month);
                const isToday = same(date, today);
                return (
                  <div
                    key={key(date)}
                    role="gridcell"
                    aria-selected={picked || inside}
                    className="relative flex h-9 items-center justify-center"
                  >
                    {(inside || opensBand || closesBand) && (
                      <span
                        aria-hidden="true"
                        className={cx(
                          "absolute inset-y-0 bg-control",
                          opensBand ? "left-1/2" : "left-0",
                          closesBand ? "right-1/2" : "right-0",
                          inside && col === 0 && "rounded-l-full",
                          inside && col === 6 && "rounded-r-full",
                        )}
                      />
                    )}
                    <button
                      type="button"
                      data-date={key(date)}
                      tabIndex={same(date, tabbable) ? 0 : -1}
                      aria-label={spoken.format(date)}
                      aria-current={isToday ? "date" : undefined}
                      aria-disabled={disabled || undefined}
                      onClick={() => pick(date)}
                      onPointerEnter={() =>
                        props.mode === "range" && setHover(date)
                      }
                      className={cx(
                        "relative flex size-9 items-center justify-center rounded-full text-label tabular-nums transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground",
                        picked
                          ? "bg-primary font-medium text-primary-ink"
                          : disabled
                            ? "cursor-default opacity-35"
                            : cx(
                                "cursor-pointer",
                                inside ? "hover:bg-control-hover" : "hover:bg-control",
                              ),
                        !picked && outside && "text-muted",
                      )}
                    >
                      {date.getDate()}
                      {isToday && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
