"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { cx, EASE } from "./cx";
import { Icon, type IconLike } from "./icon";

type Variant = "pill" | "underline";

type TabsState = {
  value: string;
  select: (value: string) => void;
  variant: Variant;
  size: "sm" | "md";
  base: string;
};

const TabsContext = createContext<TabsState | null>(null);

const useTabs = () => {
  const tabs = useContext(TabsContext);
  if (!tabs) throw new Error("Tabs pieces go inside <Tabs>.");
  return tabs;
};

const slug = (value: string) => value.replace(/[^\w-]/g, "_");

/**
 * Panels that share one place, with a tab for each. The pill look is the
 * segmented control, the underline look sits over a page like a document's
 * sections. The picked mark slides between tabs and the panel fades in.
 */
export function Tabs({
  value: held,
  defaultValue,
  onValueChange,
  variant = "pill",
  size = "md",
  className,
  children,
}: {
  /** The open tab, when you hold it yourself. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: Variant;
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const base = useId();
  const value = held ?? own;
  const select = (next: string) => {
    setOwn(next);
    onValueChange?.(next);
  };
  return (
    <TabsContext.Provider value={{ value, select, variant, size, base }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

/** The row of tabs. The arrow keys move along it, Home and End jump. */
export function TabsList({
  label,
  block = false,
  className,
  children,
}: {
  /** What the tabs switch between, for screen readers. */
  label: string;
  /** Stretches across its container. Pill look only. */
  block?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { variant } = useTabs();

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not(:disabled)',
      ),
    );
    const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const to =
      event.key === "ArrowRight"
        ? (at + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (at - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (to == null) return;
    event.preventDefault();
    tabs[to].focus();
    tabs[to].click();
  };

  // The underline's hairline is a shadow, so the scroll box does not clip
  // the mark that sits on it.
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={keys}
      className={cx(
        variant === "pill"
          ? cx(
              "max-w-full overflow-x-auto rounded-full bg-control p-0.5 [scrollbar-width:none]",
              block ? "flex w-full" : "inline-flex",
            )
          : "flex max-w-full gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One tab. Its value matches the panel it opens. */
export function TabsTrigger({
  value,
  icon,
  disabled = false,
  className,
  children,
}: {
  value: string;
  icon?: IconLike;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const tabs = useTabs();
  const on = tabs.value === value;
  const pill = tabs.variant === "pill";
  const id = slug(value);

  return (
    <button
      type="button"
      role="tab"
      id={`${tabs.base}-tab-${id}`}
      aria-selected={on}
      aria-controls={`${tabs.base}-panel-${id}`}
      tabIndex={on ? 0 : -1}
      disabled={disabled}
      onClick={() => tabs.select(value)}
      className={cx(
        "relative flex shrink-0 cursor-pointer items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors duration-150 outline-none disabled:cursor-default disabled:opacity-40",
        pill
          ? cx(
              "rounded-full focus-visible:shadow-[inset_0_0_0_1px_var(--line-strong)]",
              tabs.size === "sm" ? "h-7 px-3 text-caption" : "h-8 px-3.5 text-label",
            )
          : cx(
              "rounded-t-md",
              tabs.size === "sm" ? "h-9 text-caption" : "h-10 text-label",
            ),
        on ? "text-foreground" : "text-muted hover:text-foreground",
        className,
      )}
    >
      {on && (
        <motion.span
          layoutId={`${tabs.base}-mark`}
          aria-hidden="true"
          className={
            pill
              ? "absolute inset-0 rounded-full bg-card shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_0_0_1px_var(--border)] dark:bg-control-active"
              : "absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
          }
          transition={{ duration: 0.25, ease: EASE }}
        />
      )}
      {icon != null && (
        <span className="relative flex">
          <Icon icon={icon} size={14} />
        </span>
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

/** What a tab opens. Only the open one is drawn, and it fades in. */
export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const tabs = useTabs();
  if (tabs.value !== value) return null;
  const id = slug(value);
  return (
    <motion.div
      key={value}
      role="tabpanel"
      id={`${tabs.base}-panel-${id}`}
      aria-labelledby={`${tabs.base}-tab-${id}`}
      tabIndex={0}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className={cx("outline-none", className)}
    >
      {children}
    </motion.div>
  );
}
