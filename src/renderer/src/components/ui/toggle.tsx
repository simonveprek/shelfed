"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonSize } from "./button";
import type { IconLike } from "./icon";

/**
 * A button that stays on or off, like Bold or Pin. Pressed, it holds its
 * pressed look. Give it pressed to control it, or defaultPressed to let it
 * keep its own state.
 */
export function Toggle({
  pressed,
  defaultPressed = false,
  onPressedChange,
  variant = "ghost",
  size = "md",
  icon,
  pressedIcon,
  label,
  disabled,
  className,
  children,
}: {
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  variant?: "ghost" | "outline" | "secondary";
  size?: ButtonSize;
  icon?: IconLike;
  /** Swaps in for icon while it is on, like a bell with a line through it. */
  pressedIcon?: IconLike;
  /** What it turns on. Read out and shown on hover when it is only an icon. */
  label?: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [own, setOwn] = useState(defaultPressed);
  const on = pressed ?? own;
  const iconOnly = children == null;

  return (
    <Button
      variant={variant}
      size={size}
      square={iconOnly}
      active={on}
      aria-pressed={on}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      icon={on && pressedIcon != null ? pressedIcon : icon}
      disabled={disabled}
      onClick={() => {
        if (pressed === undefined) setOwn(!on);
        onPressedChange?.(!on);
      }}
      className={className}
    >
      {children}
    </Button>
  );
}
