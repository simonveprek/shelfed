"use client";

import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cx } from "./cx";
import { Icon, type IconLike } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

// No position here, so a button can be placed absolutely by whoever uses it.
const BASE =
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full font-medium whitespace-nowrap select-none transition-[background-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-ink hover:opacity-90",
  secondary: "bg-control text-foreground hover:bg-control-hover",
  ghost: "text-muted hover:bg-control hover:text-foreground",
  outline:
    "text-foreground shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-control",
};

const ACTIVE: Record<ButtonVariant, string> = {
  primary: "",
  secondary: "bg-control-active",
  ghost: "bg-control text-foreground",
  outline: "bg-control",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-label",
  md: "h-10 gap-2 px-4 text-[14px]",
  lg: "h-12 gap-2 px-5 text-body",
};

const SQUARE: Record<ButtonSize, string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

type Own = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Before the words. Hugeicons data or any drawing. */
  icon?: IconLike;
  /** After the words. */
  iconAfter?: IconLike;
  /** A small arrow after the words that steps forward on hover. */
  arrow?: boolean;
  /** Only the icon, in a round button. Give it a label too. */
  square?: boolean;
  /** Holds it in its pressed, current look. */
  active?: boolean;
  /** Makes it a link. Addresses starting with http open in a new tab. */
  href?: string;
  /** For a link, the kind of page transition its navigation plays. */
  transitionTypes?: string[];
  /** For a link, saves the file instead of opening it. */
  download?: boolean | string;
  className?: string;
  children?: ReactNode;
};

export type ButtonProps = Own &
  Omit<ComponentProps<"button">, keyof Own | "ref"> & {
    ref?: ComponentProps<"button">["ref"];
  };

/**
 * The button. Primary for the one thing to do next, secondary for the rest,
 * ghost for quiet actions in a row, outline beside a primary.
 */
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconAfter,
  arrow = false,
  square = false,
  active = false,
  href,
  transitionTypes,
  download,
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconSize = ICON_SIZE[size];
  const classes = cx(
    BASE,
    VARIANTS[variant],
    active && ACTIVE[variant],
    square ? SQUARE[size] : SIZES[size],
    square && "px-0",
    className,
  );
  const inner = (
    <>
      {icon != null && <Icon icon={icon} size={iconSize} />}
      {children}
      {iconAfter != null && <Icon icon={iconAfter} size={iconSize} />}
      {arrow && (
        <span className="-mr-0.5 flex opacity-55 transition-transform duration-250 ease-smooth group-hover/button:translate-x-0.5">
          <Icon icon={ArrowRight01Icon} size={iconSize - 1} />
        </span>
      )}
    </>
  );

  if (href) {
    // Everything but the button's own attributes carries over to the link.
    const { type: _type, disabled: _disabled, ...link } = rest;
    void _type;
    void _disabled;
    const shared = {
      ...(link as ComponentProps<"a">),
      download,
      className: classes,
    };
    // A file to save is a plain link, not a page to move to.
    if (download)
      return (
        <a href={href} {...shared}>
          {inner}
        </a>
      );
    if (/^https?:/.test(href))
      return (
        <a href={href} target="_blank" rel="noreferrer" {...shared}>
          {inner}
        </a>
      );
    return (
      <Link href={href} transitionTypes={transitionTypes} {...shared}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {inner}
    </button>
  );
}

/** A round button with only an icon. The label is read out and shown on hover. */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "sm",
  ...rest
}: Omit<ButtonProps, "square" | "children" | "icon"> & {
  label: string;
  icon: IconLike;
}) {
  return (
    <Button
      {...rest}
      variant={variant}
      size={size}
      square
      icon={icon}
      aria-label={label}
      title={label}
    />
  );
}
