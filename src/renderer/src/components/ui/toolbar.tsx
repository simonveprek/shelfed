"use client";

import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./button";
import { cx } from "./cx";
import type { IconLike } from "./icon";

/** A floating row of small tools, frosted over whatever is behind it. */
export function Toolbar({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cx(
        "flex items-center gap-0.5 rounded-full border border-border bg-card/85 p-1 text-foreground shadow-float backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A tool in a toolbar. Only an icon, unless it is given words. */
export function ToolbarButton({
  label,
  icon,
  children,
  ...rest
}: Omit<ButtonProps, "icon" | "variant" | "size"> & {
  label: string;
  icon: IconLike;
}) {
  return (
    <Button
      {...rest}
      variant="ghost"
      size="sm"
      square={!children}
      icon={icon}
      aria-label={label}
      title={label}
      className={cx("text-foreground", rest.className)}
    >
      {children}
    </Button>
  );
}

export function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />;
}
