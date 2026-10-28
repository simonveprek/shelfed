import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconLike } from "./icon";

/**
 * What a list or a page shows before it has anything in it. An icon in a
 * tile, what is missing, one line on why it matters, and the way to start.
 */
export function Empty({
  icon,
  title,
  description,
  action,
  size = "panel",
  className,
}: {
  icon?: IconLike;
  title: ReactNode;
  description?: ReactNode;
  /** Usually one button that makes the first item. */
  action?: ReactNode;
  /** page fills a view, panel sits inside a card or a list. */
  size?: "page" | "panel";
  className?: string;
}) {
  const page = size === "page";
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center px-6 text-center",
        page ? "py-20 sm:py-24" : "py-12",
        className,
      )}
    >
      {icon != null && (
        <span
          className={cx(
            "flex items-center justify-center border border-border bg-well text-muted",
            page ? "size-14 rounded-field" : "size-11 rounded-item",
          )}
        >
          <Icon icon={icon} size={page ? 22 : 18} />
        </span>
      )}
      <p
        className={cx(
          "font-medium",
          icon != null && (page ? "mt-5" : "mt-4"),
          page ? "text-heading" : "text-[15px] leading-snug",
        )}
      >
        {title}
      </p>
      {description && (
        <p
          className={cx(
            "mt-1.5 max-w-[340px] text-muted",
            page ? "text-[15px] leading-relaxed" : "text-label leading-relaxed",
          )}
        >
          {description}
        </p>
      )}
      {action && <div className={page ? "mt-7" : "mt-5"}>{action}</div>}
    </div>
  );
}
