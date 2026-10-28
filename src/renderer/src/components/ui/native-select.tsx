import { Fragment, type ComponentProps, type ReactNode } from "react";
import { cx } from "./cx";

export type NativeSelectOption = {
  value: string;
  label: string;
  /** Options that share a group sit under its name. */
  group?: string;
  disabled?: boolean;
};

type Own = {
  /** The options. Or pass option elements as children. */
  options?: NativeSelectOption[];
  /** Shown first and muted until something is picked. */
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
  children?: ReactNode;
};

/**
 * The browser's own select, drawn as a Fragms field with a chevron. Phones
 * open their own wheel or sheet for it, and it posts with a form as is.
 */
export function NativeSelect({
  options,
  placeholder,
  size = "md",
  className,
  children,
  ...rest
}: Own & Omit<ComponentProps<"select">, keyof Own | "multiple">) {
  // Neighbours that share a group go under one heading.
  const groups: { name?: string; items: NativeSelectOption[] }[] = [];
  for (const option of options ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.name === option.group) last.items.push(option);
    else groups.push({ name: option.group, items: [option] });
  }
  const draw = (items: NativeSelectOption[]) =>
    items.map((option) => (
      <option key={option.value} value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    ));

  return (
    <div className={cx("relative w-full", className)}>
      <select
        {...rest}
        className={cx(
          // Phones get 16px type, so Safari does not zoom in on a tap.
          "peer w-full cursor-pointer appearance-none truncate rounded-field border border-border bg-well pr-9 pl-3.5 text-[16px] text-foreground transition-[border-color,background-color] duration-150 outline-none hover:border-line-strong focus-visible:border-line-strong disabled:cursor-default disabled:opacity-45 disabled:hover:border-border sm:text-label dark:[color-scheme:dark]",
          "[&:has(option[value='']:checked)]:text-muted",
          size === "sm" ? "h-8" : "h-10",
        )}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {groups.map((group, i) =>
          group.name ? (
            <optgroup key={`${group.name}-${i}`} label={group.name}>
              {draw(group.items)}
            </optgroup>
          ) : (
            <Fragment key={`loose-${i}`}>{draw(group.items)}</Fragment>
          ),
        )}
        {children}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted peer-disabled:opacity-45"
      >
        <path
          d="M3 4.5 6 7.5 9 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
