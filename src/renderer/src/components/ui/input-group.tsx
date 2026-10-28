"use client";

import { useImperativeHandle, useRef, type ComponentProps, type MouseEvent } from "react";
import { cx } from "./cx";
import { fieldControlProps, useField } from "./field";
import { Icon, type IconLike } from "./icon";

/**
 * An input with something before or after it, like an icon, "https://", a
 * unit or a button, all inside one field. Pressing anywhere but a button
 * puts the cursor in the input.
 */
export function InputGroup({
  start,
  end,
  invalid,
  className,
  inputClassName,
  ref,
  ...rest
}: ComponentProps<"input"> & {
  /** Before the input. An icon, a word, or a small button. */
  start?: IconLike;
  /** After the input. A unit, an icon, or a small button. */
  end?: IconLike;
  /** Draws it as wrong. Inside a Field with an error, it already is. */
  invalid?: boolean;
  /** For the input itself. className goes on the field around it. */
  inputClassName?: string;
}) {
  const field = useField();
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement, []);

  const focus = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target === inner.current || target.closest("button, a, input, select, textarea")) return;
    event.preventDefault();
    inner.current?.focus();
  };

  return (
    <div
      onMouseDown={focus}
      className={cx(
        "flex h-10 w-full cursor-text items-center rounded-field border border-border bg-well text-label text-foreground transition-[border-color,background-color] duration-150 hover:border-line-strong focus-within:border-line-strong",
        "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:text-muted has-[input:disabled]:hover:border-border",
        "has-aria-invalid:border-danger/50 has-aria-invalid:hover:border-danger/70 has-aria-invalid:focus-within:border-danger",
        className,
      )}
    >
      {start != null && <Addon side="start">{start}</Addon>}
      <input
        {...fieldControlProps(field, invalid)}
        ref={inner}
        className={cx(
          "h-full min-w-0 flex-1 bg-transparent text-label text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:text-muted",
          start != null ? "pl-2" : "pl-3.5",
          end != null ? "pr-2" : "pr-3.5",
          inputClassName,
        )}
        {...rest}
      />
      {end != null && <Addon side="end">{end}</Addon>}
    </div>
  );
}

function Addon({ side, children }: { side: "start" | "end"; children: IconLike }) {
  return (
    <span
      className={cx(
        "flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap text-muted select-none",
        side === "start" ? "pl-3.5 has-[button]:pl-1" : "pr-3.5 has-[button]:pr-1",
      )}
    >
      <Icon icon={children} size={16} />
    </span>
  );
}
