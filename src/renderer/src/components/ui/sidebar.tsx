"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cancel01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { IconButton } from "./button";
import { cx, EASE } from "./cx";
import { type IconLike } from "./icon";
import { NavGroup, NavItem } from "./nav";
import { Portal } from "./portal";

type SidebarState = {
  collapsed: boolean;
  glide: string;
  /** Runs after an item is picked, so a sheet can close. */
  onNavigate?: () => void;
};

const SidebarContext = createContext<SidebarState>({
  collapsed: false,
  glide: "sidebar",
});

const OPEN = 256;
const RAIL = 64;

/**
 * The app's side of the screen. A header, groups of places, and a footer at
 * the bottom. It can fold to a rail of icons, where each one says its name
 * on hover. On phones, put the same groups in a SidebarSheet.
 */
export function Sidebar({
  header,
  footer,
  collapsed: held,
  defaultCollapsed = false,
  onCollapsedChange,
  collapsible = true,
  label = "Main",
  className,
  children,
}: {
  /** The top, like the workspace switcher. Its left edge stays on the rail. */
  header?: ReactNode;
  /** The bottom, over the collapse button. */
  footer?: ReactNode;
  /** Folded to icons, when you hold it yourself. */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Shows the button that folds it. */
  collapsible?: boolean;
  /** What the navigation is, for screen readers. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const [own, setOwn] = useState(defaultCollapsed);
  const collapsed = held ?? own;
  const glide = useId();
  const toggle = () => {
    setOwn(!collapsed);
    onCollapsedChange?.(!collapsed);
  };

  return (
    <SidebarContext.Provider value={{ collapsed, glide }}>
      <motion.aside
        data-collapsed={collapsed || undefined}
        initial={false}
        animate={{ width: collapsed ? RAIL : OPEN }}
        transition={{ duration: collapsed ? 0.15 : 0.25, ease: EASE }}
        className={cx("shrink-0 overflow-hidden", className)}
      >
        <div className="flex h-full flex-col gap-7 overflow-x-hidden overflow-y-auto px-3 py-4">
          {header && <div className="min-w-0 shrink-0 overflow-hidden">{header}</div>}
          <nav aria-label={label} className="flex flex-col gap-6">
            {children}
          </nav>
          {(footer || collapsible) && (
            <div className="mt-auto flex flex-col gap-0.5">
              {footer}
              {collapsible && (
                <SidebarItem icon={SidebarLeftIcon} onClick={toggle}>
                  {collapsed ? "Expand" : "Collapse"}
                </SidebarItem>
              )}
            </div>
          )}
        </div>
      </motion.aside>
    </SidebarContext.Provider>
  );
}

/** A titled group of places. On the rail its title fades, the gap stays. */
export function SidebarGroup({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const { collapsed } = useContext(SidebarContext);
  return (
    <NavGroup
      className={className}
      label={
        label && (
          <span
            aria-hidden={collapsed || undefined}
            className={cx(
              "block whitespace-nowrap transition-opacity duration-150",
              collapsed ? "opacity-0" : "opacity-100",
            )}
          >
            {label}
          </span>
        )
      }
    >
      {children}
    </NavGroup>
  );
}

/**
 * A place in the sidebar, on the same sliding pill as NavItem. On the rail
 * only its icon shows, and its name appears beside it on hover or focus.
 */
export function SidebarItem({
  href,
  onClick,
  active = false,
  icon,
  transitionTypes,
  children,
}: {
  href?: string;
  onClick?: () => void;
  active?: boolean;
  icon: IconLike;
  transitionTypes?: string[];
  /** The name. Plain words, so the rail can show it on hover. */
  children: string;
}) {
  const { collapsed, glide, onNavigate } = useContext(SidebarContext);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const wait = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = () => {
    if (!collapsed) return;
    clearTimeout(wait.current);
    wait.current = setTimeout(() => {
      const box = anchor.current?.getBoundingClientRect();
      if (box) setTip({ x: box.right + 8, y: box.top + box.height / 2 });
    }, 80);
  };
  const hide = () => {
    clearTimeout(wait.current);
    setTip(null);
  };
  useEffect(() => () => clearTimeout(wait.current), []);

  return (
    <span
      ref={anchor}
      className="flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      // Clicks on links bubble up here too, so a sheet closes on any pick.
      onClick={() => {
        hide();
        onNavigate?.();
      }}
    >
      <NavItem
        href={href}
        onClick={onClick}
        active={active}
        icon={icon}
        glide={glide}
        transitionTypes={transitionTypes}
        className={cx(
          "w-full [&>span:last-child]:transition-opacity [&>span:last-child]:duration-150",
          collapsed && "[&>span:last-child]:opacity-0",
        )}
      >
        {children}
      </NavItem>
      <Portal>
        <AnimatePresence>
          {collapsed && tip && (
            <motion.span
              role="tooltip"
              initial={{ opacity: 0, x: -4 }}
              animate={{
                opacity: 1,
                x: 0,
                transition: { duration: 0.15, ease: "easeOut" },
              }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              style={{ left: tip.x, top: tip.y, translate: "0 -50%" }}
              className="pointer-events-none fixed z-[90] rounded-lg bg-foreground px-2 py-1 text-caption font-medium whitespace-nowrap text-background shadow-float"
            >
              {children}
            </motion.span>
          )}
        </AnimatePresence>
      </Portal>
    </span>
  );
}

/**
 * The sidebar for phones. It slides in from the left over a dimmed page,
 * and closes on a pick, a press outside or Escape.
 */
export function SidebarSheet({
  open,
  onOpenChange,
  header,
  label = "Main",
  contained = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  header?: ReactNode;
  label?: string;
  /** Stays inside its nearest positioned parent instead of the screen, for previews. */
  contained?: boolean;
  children: ReactNode;
}) {
  const glide = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", away);
    return () => document.removeEventListener("keydown", away);
  }, [open, onOpenChange]);

  const sheet = (
    <AnimatePresence>
      {open && (
        <div className={cx("inset-0 z-50", contained ? "absolute" : "fixed")}>
          <motion.div
            className="absolute inset-0 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.25 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-6 overflow-y-auto bg-background p-3 shadow-float"
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { duration: 0.25, ease: EASE } }}
            exit={{ x: -24, opacity: 0, transition: { duration: 0.15, ease: EASE } }}
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">{header}</div>
              <IconButton
                label="Close"
                icon={Cancel01Icon}
                autoFocus
                onClick={() => onOpenChange(false)}
              />
            </div>
            <SidebarContext.Provider
              value={{
                collapsed: false,
                glide,
                onNavigate: () => onOpenChange(false),
              }}
            >
              <nav aria-label={label} className="flex flex-col gap-6">
                {children}
              </nav>
            </SidebarContext.Provider>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return contained ? sheet : <Portal>{sheet}</Portal>;
}
