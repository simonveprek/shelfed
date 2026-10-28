import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cx } from "./cx";
import { Icon } from "./icon";

const external = (href: string) => /^https?:/.test(href);

/** A link inside running text, underlined softly until you point at it. */
export function TextLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const classes = cx(
    "font-medium text-foreground underline decoration-underline decoration-1 underline-offset-[5px] transition-[text-decoration-color] duration-150 hover:decoration-foreground",
    className,
  );
  return external(href) ? (
    <a href={href} target="_blank" rel="noreferrer" className={classes}>
      {children}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** A link on its own, with an arrow that steps forward on hover. */
export function ArrowLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const classes = cx(
    "group/arrow inline-flex items-center gap-1 text-label font-medium text-muted transition-colors duration-150 hover:text-foreground",
    className,
  );
  const inner = (
    <>
      {children}
      <Icon
        icon={ArrowRight01Icon}
        size={13}
        className="transition-transform duration-250 ease-smooth group-hover/arrow:translate-x-0.5"
      />
    </>
  );
  return external(href) ? (
    <a href={href} target="_blank" rel="noreferrer" className={classes}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {inner}
    </Link>
  );
}
