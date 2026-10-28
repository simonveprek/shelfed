"use client";

import {
  createContext,
  useContext,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Badge, Kbd } from "./badge";
import { cx, EASE } from "./cx";
import { Icon } from "./icon";

export type FieldState = {
  /** The id the control inside takes, so the label points at it. */
  id: string;
  /** The label's own id, for groups that are named by it. */
  labelId: string;
  /** The hint or error under the control, when there is one. */
  describedBy?: string;
  invalid: boolean;
};

const FieldContext = createContext<FieldState | null>(null);

/** The Field a control sits in, if any. Controls take their id and error from it. */
export function useField() {
  return useContext(FieldContext);
}

/** What a control inside a Field takes from it. Its own props still win. */
export function fieldControlProps(field: FieldState | null, invalid?: boolean) {
  const bad = invalid ?? field?.invalid ?? false;
  return {
    id: field?.id,
    "aria-describedby": field?.describedBy,
    "aria-invalid": bad ? true : undefined,
  };
}

/** A setting's name over its control, with an optional hint under it. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  pro = false,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** What is wrong with the value. Takes the hint's place and marks the control invalid. */
  error?: ReactNode;
  /** The id of the control. One is made up when it is left out. */
  htmlFor?: string;
  /** Marks it as part of Pro. */
  pro?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const message = error || hint;
  const invalid = Boolean(error);
  const state: FieldState = {
    id,
    labelId: `${id}-label`,
    describedBy: message ? `${id}-message` : undefined,
    invalid,
  };

  return (
    <FieldContext value={state}>
      <div className={cx("flex flex-col gap-2.5", className)}>
        <label id={state.labelId} htmlFor={id} className="flex items-center gap-1.5 text-label">
          {label}
          {pro && <Badge tone="strong">Pro</Badge>}
        </label>
        {children}
        <AnimatePresence initial={false}>
          {message && (
            <motion.div
              key="message"
              initial={{ height: 0, opacity: 0, overflow: "hidden" }}
              animate={{
                height: "auto",
                opacity: 1,
                transition: { duration: 0.25, ease: EASE },
                transitionEnd: { overflow: "visible" },
              }}
              exit={{ height: 0, opacity: 0, overflow: "hidden", transition: { duration: 0.15, ease: EASE } }}
              className="-mt-2.5"
            >
              <p id={`${id}-message`} className={cx("pt-1.5 text-caption", invalid ? "text-danger" : "text-muted")}>
                {message}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FieldContext>
  );
}

const INPUT =
  "w-full rounded-field border border-border bg-well px-3.5 text-label text-foreground outline-none transition-[border-color,background-color] duration-150 placeholder:text-muted hover:border-line-strong focus-visible:border-line-strong focus-visible:outline-none";

// Added states. Wrong comes from the invalid prop, an error on the Field, or aria-invalid by hand.
const STATES =
  "disabled:cursor-not-allowed disabled:text-muted disabled:hover:border-border aria-invalid:border-danger/50 aria-invalid:hover:border-danger/70 aria-invalid:focus-visible:border-danger";

/** A line of text to type. */
export function Input({
  className,
  invalid,
  ...rest
}: ComponentProps<"input"> & {
  /** Draws it as wrong. Inside a Field with an error, it already is. */
  invalid?: boolean;
}) {
  const field = useField();
  return <input {...fieldControlProps(field, invalid)} className={cx(INPUT, STATES, "h-10", className)} {...rest} />;
}

// Grows the box to fit what is typed, borders included.
function fit(node: HTMLTextAreaElement | null) {
  if (!node) return;
  node.style.height = "auto";
  node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
}

/** Several lines of text to type. */
export function Textarea({
  className,
  invalid,
  autoResize = false,
  ref,
  onInput,
  ...rest
}: ComponentProps<"textarea"> & {
  /** Draws it as wrong. Inside a Field with an error, it already is. */
  invalid?: boolean;
  /** Grows with the text instead of scrolling. Cap it with a max height class. */
  autoResize?: boolean;
}) {
  const field = useField();
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement, []);
  const value = rest.value;
  useLayoutEffect(() => {
    if (autoResize) fit(inner.current);
  }, [autoResize, value]);

  return (
    <textarea
      {...fieldControlProps(field, invalid)}
      ref={inner}
      onInput={(event) => {
        if (autoResize) fit(event.currentTarget);
        onInput?.(event);
      }}
      className={cx(INPUT, STATES, "resize-none py-2.5 leading-snug", className)}
      {...rest}
    />
  );
}

/** A search box on a pill, with the key that opens it. */
export function SearchField({
  shortcut,
  className,
  ...rest
}: ComponentProps<"input"> & { shortcut?: string }) {
  return (
    <label
      className={cx(
        "flex h-9 items-center gap-2 rounded-full bg-control px-3.5 text-muted transition-colors duration-150 focus-within:bg-control-hover",
        className,
      )}
    >
      <Icon icon={Search01Icon} size={14} />
      <input
        className="min-w-0 flex-1 bg-transparent text-label text-foreground outline-none placeholder:text-muted"
        {...rest}
      />
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </label>
  );
}
