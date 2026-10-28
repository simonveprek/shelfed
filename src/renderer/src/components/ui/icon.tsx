import { isValidElement, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Copy01Icon } from "@hugeicons/core-free-icons";

export type IconData = typeof Copy01Icon;
/** A Hugeicons icon, or anything already drawn. */
export type IconLike = IconData | ReactNode;

/** Draws an icon at a size, whether it came as Hugeicons data or a drawing. */
export function Icon({
  icon,
  size = 16,
  strokeWidth = 2,
  className,
}: {
  icon: IconLike;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  if (icon == null || icon === false) return null;
  if (isValidElement(icon) || typeof icon !== "object") return <>{icon}</>;
  return (
    <HugeiconsIcon
      icon={icon as IconData}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
    />
  );
}
