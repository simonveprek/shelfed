"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { Kbd } from "./badge";
import { cx, EASE } from "./cx";
import { Icon, type IconLike } from "./icon";

type Trigger = {
  open: boolean;
  toggle: () => void;
  /** Spread onto the button that opens it. */
  props: {
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
  };
};

/**
 * A menu that grows from its button. It opens in 250ms and closes faster, in
 * 150ms. A click away or Escape closes it, and the arrows move through it.
 */
export function Menu({
  trigger,
  label,
  align = "start",
  side = "bottom",
  width = 260,
  className,
  children,
}: {
  trigger: (state: Trigger) => ReactNode;
  label: string;
  align?: "start" | "end";
  side?: "bottom" | "top";
  width?: number;
  className?: string;
  /** The items, or a function given close for items that need it. */
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  const move = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      surface.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])',
      ) ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? (at + 1) % items.length
        : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const origin = `${side === "bottom" ? "top" : "bottom"} ${align === "start" ? "left" : "right"}`;

  return (
    <div ref={box} className="relative" onKeyDown={move}>
      {trigger({
        open,
        toggle: () => setOpen((now) => !now),
        props: {
          "aria-haspopup": "menu",
          "aria-expanded": open,
          "aria-controls": id,
          onClick: () => setOpen((now) => !now),
        },
      })}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={surface}
            id={id}
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition: { duration: 0.25, ease: EASE },
            }}
            exit={{
              opacity: 0,
              scale: 0.99,
              transition: { duration: 0.15, ease: EASE },
            }}
            style={{ width, transformOrigin: origin }}
            className={cx(
              "absolute z-50 rounded-[18px] border border-border bg-card p-1.5 shadow-float",
              side === "bottom"
                ? "top-[calc(100%+8px)]"
                : "bottom-[calc(100%+8px)]",
              align === "start" ? "left-0" : "right-0",
              className,
            )}
          >
            {typeof children === "function" ? children(close) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One thing to do in a menu, with an optional icon and a line under it. */
export function MenuItem({
  icon,
  note,
  selected,
  shortcut,
  danger = false,
  disabled = false,
  onSelect,
  children,
}: {
  icon?: IconLike;
  note?: ReactNode;
  /** Shows a check, for menus that pick one thing. */
  selected?: boolean;
  /** The keys that do the same thing, shown on the right. */
  shortcut?: ReactNode;
  /** In red, for things that remove or cannot be undone. */
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role={selected === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full cursor-pointer items-start gap-3 rounded-item px-3 py-2.5 text-left transition-colors duration-150 outline-none hover:bg-control focus-visible:bg-control disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
    >
      {icon != null && (
        <span className={cx("mt-0.5 flex", danger ? "text-danger" : "text-muted")}>
          <Icon icon={icon} size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cx(
            "block text-[14px] leading-snug font-medium",
            danger && "text-danger",
          )}
        >
          {children}
        </span>
        {note && (
          <span className="mt-0.5 block text-label leading-snug text-muted">
            {note}
          </span>
        )}
      </span>
      {shortcut != null && <Kbd className="shrink-0">{shortcut}</Kbd>}
      {selected && (
        <span className="mt-0.5 flex">
          <Icon icon={Tick02Icon} size={14} strokeWidth={2.2} />
        </span>
      )}
    </button>
  );
}

/** A quiet heading over a group of items. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-2 pb-1.5 text-caption font-medium text-muted">
      {children}
    </p>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="mx-2 my-1.5 h-px bg-border" />;
}
