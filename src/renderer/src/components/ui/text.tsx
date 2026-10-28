import type { ElementType, ReactNode } from "react";
import { cx } from "./cx";

type TextProps = {
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  id?: string;
};

/** The largest words on a page. One per page, at most. */
export function Display({ as: As = "h1", className, children, id }: TextProps) {
  return (
    <As id={id} className={cx("text-display", className)}>
      {children}
    </As>
  );
}

/** A page or section title. */
export function Title({ as: As = "h2", className, children, id }: TextProps) {
  return (
    <As id={id} className={cx("text-title", className)}>
      {children}
    </As>
  );
}

/** A heading inside a section, over a card or a group. */
export function Heading({ as: As = "h3", className, children, id }: TextProps) {
  return (
    <As id={id} className={cx("text-heading", className)}>
      {children}
    </As>
  );
}

type Size = "body" | "label" | "caption";
type Tone = "default" | "muted";

/** Running text. Muted for supporting lines, label and caption for small print. */
export function Text({
  as: As = "p",
  size = "body",
  tone = "default",
  className,
  children,
  id,
}: TextProps & { size?: Size; tone?: Tone }) {
  return (
    <As
      id={id}
      className={cx(
        size === "body"
          ? "text-body"
          : size === "label"
            ? "text-label"
            : "text-caption",
        tone === "muted" && "text-muted",
        className,
      )}
    >
      {children}
    </As>
  );
}

/**
 * The top of a section. A title, a line about it, and an action on the right
 * that drops below on phones.
 */
export function SectionHeader({
  title,
  description,
  action,
  as = "h2",
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: ElementType;
  className?: string;
  id?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-end justify-between gap-x-8 gap-y-4",
        className,
      )}
    >
      <div className="min-w-0">
        <Title as={as} id={id}>
          {title}
        </Title>
        {description && (
          <Text tone="muted" className="mt-3 max-w-[52ch]">
            {description}
          </Text>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  );
}
