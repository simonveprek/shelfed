"use client";

import { useRef, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";

const subscribe = () => () => {};

/**
 * Light and dark. The new theme spreads out as a circle from the button,
 * and the icon turns over as it swaps.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";
  const button = useRef<HTMLButtonElement>(null);

  function toggle() {
    const next = isDark ? "light" : "dark";
    const apply = () => {
      // Flip the class at once, so the transition captures the new theme.
      const root = document.documentElement;
      root.classList.toggle("dark", next === "dark");
      root.style.colorScheme = next;
      setTheme(next);
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion || !button.current) {
      apply();
      return;
    }

    const { left, top, width, height } = button.current.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 550, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  }

  return (
    <motion.button
      ref={button}
      type="button"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
      whileTap={{ scale: 0.9 }}
      className={`relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-pill text-foreground transition-colors hover:bg-tile ${className}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {mounted && (
          <motion.span
            key={isDark ? "sun" : "moon"}
            initial={{ y: 16, opacity: 0, rotate: -45 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: -16, opacity: 0, rotate: 45 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
            className="flex"
          >
            <HugeiconsIcon icon={isDark ? Sun03Icon : Moon02Icon} size={16} strokeWidth={2} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
