"use client";

import type { ReactNode } from "react";
import {
  Alert02Icon,
  AlertCircleIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { IconButton } from "./button";
import { cx } from "./cx";
import { Icon, type IconLike } from "./icon";

export type AlertTone = "neutral" | "success" | "warning" | "danger";

const SURFACE: Record<AlertTone, string> = {
  neutral: "border-border bg-well",
  warning: "border-line-strong bg-well",
  success: "border-transparent bg-success/12",
  danger: "border-transparent bg-danger/12",
};

const INK: Record<AlertTone, string> = {
  neutral: "text-muted",
  warning: "text-muted",
  success: "text-success",
  danger: "text-danger",
};

const ICONS: Record<AlertTone, IconLike> = {
  neutral: InformationCircleIcon,
  warning: Alert02Icon,
  success: CheckmarkCircle02Icon,
  danger: AlertCircleIcon,
};

/**
 * A message that sits in the page, next to what it is about. Warnings and
 * errors are read out as soon as they appear, the rest are read in turn.
 */
export function Alert({
  tone = "neutral",
  title,
  icon,
  action,
  onDismiss,
  className,
  children,
}: {
  tone?: AlertTone;
  title: ReactNode;
  /** In place of the tone's own icon. */
  icon?: IconLike;
  /** One button on the right, like Update card. */
  action?: ReactNode;
  /** Shows a close button that runs this. */
  onDismiss?: () => void;
  className?: string;
  /** The line under the title. */
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cx(
        "flex w-full flex-wrap items-start gap-x-3 gap-y-3 rounded-field border px-4 py-3.5",
        SURFACE[tone],
        className,
      )}
    >
      <div className="flex min-w-[220px] flex-1 items-start gap-3">
        <span className={cx("mt-px flex shrink-0", INK[tone])}>
          <Icon icon={icon ?? ICONS[tone]} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug font-medium">{title}</p>
          {children && (
            <div className="mt-1 text-label leading-relaxed text-muted">
              {children}
            </div>
          )}
        </div>
      </div>
      {(action || onDismiss) && (
        <div
          className={cx(
            "ml-auto flex shrink-0 items-center gap-1",
            action ? "-my-1 self-center" : "-my-1.5 self-start",
          )}
        >
          {action}
          {onDismiss && (
            <IconButton
              label="Dismiss"
              icon={Cancel01Icon}
              onClick={onDismiss}
              className="-mr-1.5"
            />
          )}
        </div>
      )}
    </div>
  );
}
