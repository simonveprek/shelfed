import type { ComponentProps } from "react";
import { cx } from "./cx";

type Align = "left" | "right";

/**
 * Rows of data on a panel, like the lists in Fragms. Quiet headers, a
 * hairline between rows, and a shade under the row the pointer is on. Wide
 * tables scroll sideways inside the panel on phones.
 */
export function Table({
  bare = false,
  className,
  children,
  ...rest
}: ComponentProps<"table"> & {
  /** Leaves out the panel, for a table already inside one. */
  bare?: boolean;
}) {
  return (
    <div
      className={cx(
        "w-full overflow-x-auto",
        !bare && "rounded-panel border border-border bg-card shadow-card",
      )}
    >
      <table
        className={cx("w-full border-collapse text-left text-[14px]", className)}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

/** The row of column names. */
export function TableHeader({ className, ...rest }: ComponentProps<"thead">) {
  return (
    <thead
      className={cx("[&>tr]:border-b [&>tr]:border-border", className)}
      {...rest}
    />
  );
}

/** The rows themselves. Each one shades on hover. */
export function TableBody({ className, ...rest }: ComponentProps<"tbody">) {
  return (
    <tbody
      className={cx(
        "[&>tr]:transition-colors [&>tr]:duration-150 [&>tr:not([data-selected]):hover]:bg-card-hover",
        className,
      )}
      {...rest}
    />
  );
}

/** One row. A selected row sits a shade lower. */
export function TableRow({
  selected = false,
  className,
  ...rest
}: ComponentProps<"tr"> & { selected?: boolean }) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cx(
        "border-b border-border last:border-b-0",
        selected && "bg-well",
        className,
      )}
      {...rest}
    />
  );
}

/** A column name, in small muted type. Numbers line up on the right. */
export function TableHead({
  align = "left",
  className,
  ...rest
}: ComponentProps<"th"> & { align?: Align }) {
  return (
    <th
      scope="col"
      className={cx(
        "h-10 px-4 text-caption font-medium whitespace-nowrap text-muted first:pl-5 last:pr-5",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    />
  );
}

/** A value in a row. */
export function TableCell({
  align = "left",
  className,
  ...rest
}: ComponentProps<"td"> & { align?: Align }) {
  return (
    <td
      className={cx(
        "h-12 px-4 py-2.5 align-middle first:pl-5 last:pr-5",
        align === "right" ? "text-right tabular-nums" : "text-left",
        className,
      )}
      {...rest}
    />
  );
}

/** What the table holds, read out first. Hidden unless you show it. */
export function TableCaption({
  visible = false,
  className,
  ...rest
}: ComponentProps<"caption"> & { visible?: boolean }) {
  return (
    <caption
      className={cx(
        visible
          ? "caption-bottom border-t border-border px-5 py-3 text-left text-caption text-muted"
          : "sr-only",
        className,
      )}
      {...rest}
    />
  );
}
