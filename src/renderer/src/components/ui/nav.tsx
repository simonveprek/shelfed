"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { cx, EASE } from "./cx";
import { Icon, type IconLike } from "./icon";

/** A titled group of links in a sidebar. */
export function NavGroup({
  label,
  children,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-0.5", className)}>
      {label && (
        <p className="px-2.5 pb-1.5 text-caption font-medium text-muted">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

/**
 * A place in a sidebar. The current one sits on a pill that slides to it
 * from the last one, so give every item in a sidebar the same glide name.
 */
export function NavItem({
  href,
  onClick,
  active = false,
  icon,
  glide,
  compact = false,
  transitionTypes,
  className,
  children,
}: {
  href?: string;
  onClick?: () => void;
  active?: boolean;
  icon?: IconLike;
  /** Shared by the items of one sidebar, so the pill travels between them. */
  glide: string;
  /** Only the icon, with the words as its label. */
  compact?: boolean;
  /** For a link, the kind of page transition its navigation plays. */
  transitionTypes?: string[];
  className?: string;
  children: ReactNode;
}) {
  const classes = cx(
    "relative flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-item px-2.5 text-[14px] transition-colors duration-150",
    active ? "text-foreground" : "text-muted hover:text-foreground",
    compact && "justify-center",
    className,
  );
  const inner = (
    <>
      {active && (
        <motion.span
          layoutId={glide}
          aria-hidden="true"
          className="absolute inset-0 rounded-item bg-control"
          transition={{ duration: 0.25, ease: EASE }}
        />
      )}
      {icon != null && (
        <span className="relative flex size-5 shrink-0 items-center justify-center">
          <Icon icon={icon} size={16} strokeWidth={1.8} />
        </span>
      )}
      {!compact && <span className="relative truncate">{children}</span>}
    </>
  );
  const label = compact && typeof children === "string" ? children : undefined;
  if (href)
    return (
      <Link
        href={href}
        transitionTypes={transitionTypes}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        title={label}
        className={classes}
        onClick={onClick}
      >
        {inner}
      </Link>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      className={classes}
    >
      {inner}
    </button>
  );
}

/**
 * Where you are, as a trail of links. The last one is the page itself. With
 * max, a long trail folds its middle into a button that opens it again.
 */
export function Breadcrumbs({
  items,
  max,
  className,
}: {
  items: { label: ReactNode; href?: string; transitionTypes?: string[] }[];
  /** The most crumbs to show. The first stays, then the last ones. */
  max?: number;
  className?: string;
}) {
  const [unfolded, setUnfolded] = useState(false);
  const entries = items.map((item, i) => ({ item, i }));
  const fold = max != null && max >= 2 && !unfolded && items.length > max;
  const shown: ((typeof entries)[number] | "fold")[] = fold
    ? [entries[0], "fold", ...entries.slice(items.length - (max - 1))]
    : entries;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1.5 text-label text-muted">
        {shown.map((entry, at) =>
          entry === "fold" ? (
            <li key="fold" className="flex items-center gap-1.5">
              <Icon icon={ArrowRight01Icon} size={12} />
              <button
                type="button"
                aria-label="Show the full path"
                onClick={() => setUnfolded(true)}
                className="flex h-5 cursor-pointer items-center rounded-md px-1 transition-colors duration-150 hover:bg-control hover:text-foreground"
              >
                <Icon icon={MoreHorizontalIcon} size={14} />
              </button>
            </li>
          ) : (
            <li key={entry.i} className="flex items-center gap-1.5">
              {at > 0 && <Icon icon={ArrowRight01Icon} size={12} />}
              {entry.item.href && entry.i < items.length - 1 ? (
                <Link
                  href={entry.item.href}
                  transitionTypes={entry.item.transitionTypes}
                  className="transition-colors duration-150 hover:text-foreground"
                >
                  {entry.item.label}
                </Link>
              ) : (
                <span
                  aria-current={entry.i === items.length - 1 ? "page" : undefined}
                  className={entry.i === items.length - 1 ? "text-foreground" : ""}
                >
                  {entry.item.label}
                </span>
              )}
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

/** The page before or after, as a card, so reading on is one tap. */
export function PagerLink({
  href,
  label,
  title,
  icon,
  direction,
  transitionTypes,
}: {
  href: string;
  label: ReactNode;
  title: ReactNode;
  icon?: ReactNode;
  direction: "back" | "next";
  /** The kind of page transition the navigation plays. */
  transitionTypes?: string[];
}) {
  const back = direction === "back";
  return (
    <Link
      href={href}
      transitionTypes={transitionTypes}
      className={cx(
        "group/pager flex items-center gap-3.5 rounded-panel border border-border bg-card shadow-card p-4 transition-colors duration-150 hover:bg-card-hover",
        !back && "sm:col-start-2 sm:text-right",
      )}
    >
      {back && (
        <Icon
          icon={ArrowLeft01Icon}
          size={16}
          className="text-muted transition-transform duration-250 ease-smooth group-hover/pager:-translate-x-1"
        />
      )}
      {icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-item bg-control">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-caption text-muted">{label}</span>
        <span className="block text-[15px] font-medium">{title}</span>
      </span>
      {!back && (
        <Icon
          icon={ArrowRight01Icon}
          size={16}
          className="text-muted transition-transform duration-250 ease-smooth group-hover/pager:translate-x-1"
        />
      )}
    </Link>
  );
}
