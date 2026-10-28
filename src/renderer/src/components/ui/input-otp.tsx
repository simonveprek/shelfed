"use client";

import { Fragment, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx, EASE } from "./cx";
import { useField } from "./field";

const POP = [0.34, 1.56, 0.64, 1] as const;

/**
 * A one time code in separate cells. Typing moves on, backspace steps back,
 * and a pasted or autofilled code fills every cell at once. The value is
 * one string with no gaps.
 */
export function InputOTP({
  length = 6,
  value: controlled,
  defaultValue = "",
  onChange,
  onComplete,
  mode = "numeric",
  split,
  name,
  label = "Verification code",
  invalid,
  disabled = false,
  autoFocus = false,
  className,
}: {
  /** How many cells. */
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Runs once every cell is filled, with the full code. */
  onComplete?: (value: string) => void;
  /** Digits only, or letters and digits. */
  mode?: "numeric" | "text";
  /** Puts a small gap after every so many cells, like 3 for 123 456. */
  split?: number;
  /** Posts the code with a form under this name. */
  name?: string;
  /** Read out for the group. A Field around it names it instead. */
  label?: string;
  /** Draws it as wrong and gives it a small shake. */
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const field = useField();
  const [own, setOwn] = useState(defaultValue);
  const value = (controlled ?? own).slice(0, length);
  const cells = useRef<(HTMLInputElement | null)[]>([]);
  // Where focus goes once a new value has rendered.
  const pending = useRef<number | null>(null);
  const bad = invalid ?? field?.invalid ?? false;
  const allowed = mode === "numeric" ? /\d/ : /[a-z0-9]/i;

  const clean = (text: string) =>
    Array.from(text)
      .filter((char) => allowed.test(char))
      .join("");

  const focusCell = (index: number) => {
    const cell = cells.current[Math.max(0, Math.min(index, length - 1))];
    cell?.focus();
    cell?.select();
  };

  useLayoutEffect(() => {
    if (pending.current === null) return;
    focusCell(pending.current);
    pending.current = null;
  });

  const commit = (next: string, focusAt: number) => {
    const code = next.slice(0, length);
    const target = Math.min(focusAt, code.length);
    if (code === value) return focusCell(target);
    pending.current = target;
    if (controlled === undefined) setOwn(code);
    onChange?.(code);
    if (code.length === length) onComplete?.(code);
  };

  // Puts text in from a cell on, for typing, paste and autofill alike.
  const insert = (index: number, text: string) => {
    const chars = clean(text);
    if (!chars) return;
    // A whole code pasted anywhere replaces what is there.
    const from = chars.length >= length ? 0 : index;
    const next = value.slice(0, from) + chars + value.slice(from + chars.length);
    commit(next, from + chars.length);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (value[index]) commit(value.slice(0, index) + value.slice(index + 1), index);
      else if (index > 0) commit(value.slice(0, index - 1) + value.slice(index), index - 1);
    } else if (event.key === "Delete") {
      event.preventDefault();
      commit(value.slice(0, index) + value.slice(index + 1), index);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(Math.min(index + 1, value.length));
    } else if (event.key === "Home") {
      event.preventDefault();
      focusCell(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusCell(value.length);
    }
  };

  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    insert(index, event.clipboardData.getData("text"));
  };

  return (
    <motion.div
      role="group"
      aria-label={field ? undefined : label}
      aria-labelledby={field?.labelId}
      aria-describedby={field?.describedBy}
      animate={{ x: bad ? [0, -6, 6, -4, 4, 0] : 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={cx("flex items-center gap-1.5 sm:gap-2", disabled && "opacity-45", className)}
    >
      {Array.from({ length }, (_, index) => {
        const char = value[index] ?? "";
        const gap = split && index > 0 && index % split === 0;
        return (
          <Fragment key={index}>
            {gap && <span aria-hidden="true" className="mx-0.5 h-0.5 w-2 shrink-0 rounded-full bg-control-active" />}
            <span
              className={cx(
                "relative h-12 w-10 shrink-0 rounded-field border bg-well transition-[border-color,box-shadow] duration-150 sm:w-11",
                bad
                  ? "border-danger/50 focus-within:border-danger focus-within:shadow-[inset_0_0_0_1px_var(--danger)]"
                  : "border-border hover:border-line-strong focus-within:border-line-strong focus-within:shadow-[inset_0_0_0_1px_var(--line-strong)]",
              )}
            >
              <input
                ref={(node) => {
                  cells.current[index] = node;
                }}
                id={index === 0 ? field?.id : undefined}
                type="text"
                inputMode={mode === "numeric" ? "numeric" : "text"}
                autoComplete={index === 0 ? "one-time-code" : "off"}
                autoCapitalize="off"
                spellCheck={false}
                autoFocus={autoFocus && index === 0}
                disabled={disabled}
                value={char}
                aria-label={`${mode === "numeric" ? "Digit" : "Character"} ${index + 1} of ${length}`}
                aria-invalid={bad || undefined}
                onFocus={(event) => {
                  // Cells fill in order, so focus never lands past the first empty one.
                  if (index > value.length) focusCell(value.length);
                  else event.currentTarget.select();
                }}
                onKeyDown={(event) => onKeyDown(index, event)}
                onPaste={(event) => onPaste(index, event)}
                onChange={(event) => {
                  const typed = event.target.value;
                  // Some phone keyboards delete without a Backspace key event.
                  if (!typed) return commit(value.slice(0, index) + value.slice(index + 1), index);
                  // The cell's own character may still be in there, next to the new one.
                  const fresh = char && typed.length === 2 && typed.includes(char) ? typed.replace(char, "") : typed;
                  if (fresh) insert(index, fresh);
                }}
                className="absolute inset-0 size-full rounded-field bg-transparent text-center text-transparent caret-foreground outline-none selection:bg-transparent! disabled:cursor-not-allowed"
              />
              <AnimatePresence initial={false}>
                {char && (
                  <motion.span
                    key={char}
                    aria-hidden="true"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1, transition: { duration: 0.35, ease: POP } }}
                    exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.15, ease: EASE } }}
                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-heading tabular-nums"
                  >
                    {char}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </Fragment>
        );
      })}
      {name && <input type="hidden" name={name} value={value} />}
    </motion.div>
  );
}
