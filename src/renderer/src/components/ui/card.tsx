import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import { cx } from "./cx";

/**
 * A card. A soft frame with a little room inside it, so whatever sits in it,
 * usually a stage, reads as held rather than stuck on.
 */
export function Card({
  as: As = "div",
  href,
  transitionTypes,
  className,
  children,
}: {
  as?: ElementType;
  /** Makes the whole card a link that lifts a shade on hover. */
  href?: string;
  /** For a link, the kind of page transition its navigation plays. */
  transitionTypes?: string[];
  className?: string;
  children: ReactNode;
}) {
  const classes = cx(
    "group/card flex flex-col rounded-card border border-border bg-card p-2 shadow-card",
    href &&
      "transition-[background-color,transform] duration-150 ease-out hover:bg-card-hover active:scale-[0.99]",
    className,
  );
  if (href)
    return (
      <Link href={href} transitionTypes={transitionTypes} className={classes}>
        {children}
      </Link>
    );
  return <As className={classes}>{children}</As>;
}

/** The well inside a card, where the thing itself is shown. */
export function CardStage({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "relative flex items-center justify-center overflow-hidden rounded-stage border border-border bg-well",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The words under a stage, with room for one action on the right. */
export function CardBody({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center gap-3 px-3 pt-3.5 pb-2", className)}>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug font-medium">{title}</p>
        {description && (
          <p className="mt-0.5 text-label text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** A plain surface for settings, lists and anything that is not a showcase. */
export function Panel({
  as: As = "div",
  padded = true,
  className,
  children,
}: {
  as?: ElementType;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <As
      className={cx(
        "rounded-panel border border-border bg-card shadow-card",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </As>
  );
}

/** A sunken area inside a panel, for code, previews and fields. */
export function Well({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx("rounded-field border border-border bg-well", className)}
    >
      {children}
    </div>
  );
}
