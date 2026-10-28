"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import { Icon } from "./icon";

/** Copies, then shows a tick for a moment. Give it text, or a way to get it. */
function useCopy(value: string | (() => Promise<string> | string)) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      const text = typeof value === "function" ? await value() : value;
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };
  return { copied, copy };
}

/** The icon swaps through a short blur, 250ms, the way an icon swap should. */
function CopyIcon({ copied, size }: { copied: boolean; size: number }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={copied ? "done" : "copy"}
        initial={{ opacity: 0, scale: 0.25, filter: "blur(2px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.25, filter: "blur(2px)" }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="flex"
      >
        <Icon
          icon={copied ? Tick02Icon : Copy01Icon}
          size={size}
          className={copied ? "text-emerald-500" : undefined}
        />
      </motion.span>
    </AnimatePresence>
  );
}

/**
 * A copy button. Round with only the icon by default, or with words when
 * given a label to show.
 */
export function CopyButton({
  value,
  label = "Copy",
  showLabel = false,
  variant = "ghost",
  size = "sm",
  className,
}: {
  value: string | (() => Promise<string> | string);
  label?: string;
  /** Shows the words beside the icon. */
  showLabel?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { copied, copy } = useCopy(value);
  const iconSize = size === "sm" ? 14 : 16;
  if (showLabel)
    return (
      <Button
        variant={variant}
        size={size}
        onClick={copy}
        className={className ?? "relative"}
        icon={<CopyIcon copied={copied} size={iconSize} />}
      >
        {copied ? "Copied" : label}
      </Button>
    );
  return (
    <Button
      variant={variant}
      size={size}
      square
      onClick={copy}
      aria-label={label}
      title={label}
      className={className ?? "relative"}
      icon={<CopyIcon copied={copied} size={iconSize + 1} />}
    />
  );
}
