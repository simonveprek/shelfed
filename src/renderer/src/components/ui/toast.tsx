"use client";

import {
  Alert02Icon,
  InformationCircleIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { AnimatePresence, motion } from "framer-motion";
import { useSyncExternalStore } from "react";
import { cx, EASE } from "./cx";
import { Icon } from "./icon";

/*
 * toast.success("Saved") and toast.error("Nope"). A small card at the
 * bottom right that rises in 250ms, leaves in 150ms and goes after 4s.
 * toast("Text") is a plain one, and each can take a line under it and
 * one action, like Undo.
 */

type Tone = "success" | "error" | "neutral";

export type ToastOptions = {
  /** A quieter line under the text. */
  description?: string;
  /** One button on the right. A press runs it and closes the toast. */
  action?: { label: string; onClick: () => void };
  /** How long it stays, in ms. 4000, or 6000 with an action. */
  duration?: number;
};

type Item = { id: number; tone: Tone; text: string } & ToastOptions;

let items: Item[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

function push(tone: Tone, text: string, options: ToastOptions = {}) {
  const id = next++;
  items = [...items.slice(-2), { id, tone, text, ...options }];
  emit();
  setTimeout(
    () => dismiss(id),
    options.duration ?? (options.action ? 6000 : 4000),
  );
  return id;
}

export const toast = Object.assign(
  (text: string, options?: ToastOptions) => push("neutral", text, options),
  {
    success: (text: string, options?: ToastOptions) =>
      push("success", text, options),
    error: (text: string, options?: ToastOptions) =>
      push("error", text, options),
    /** Closes one early, by the id a toast call returns. */
    dismiss,
  },
);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const EMPTY: Item[] = [];

const ICONS = {
  success: Tick02Icon,
  error: Alert02Icon,
  neutral: InformationCircleIcon,
};

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {list.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: EASE } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: EASE } }}
            className={cx(
              "pointer-events-auto flex gap-2.5 rounded-[18px] border border-border bg-card py-3 pr-4 pl-3.5 text-label font-medium shadow-float",
              item.description ? "items-start" : "items-center",
              item.action && "w-full pr-3",
            )}
          >
            <span
              className={cx(
                "flex",
                item.description && "mt-px",
                item.tone === "error" && "text-danger",
                item.tone === "success" && "text-success",
                item.tone === "neutral" && "text-muted",
              )}
            >
              <Icon icon={ICONS[item.tone]} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              {item.text}
              {item.description && (
                <span className="mt-0.5 block font-normal text-muted">
                  {item.description}
                </span>
              )}
            </span>
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
                className={cx(
                  "h-8 shrink-0 cursor-pointer rounded-full bg-control px-3 text-label font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-control-hover active:scale-[0.97]",
                  item.description ? "self-center" : "-my-1",
                )}
              >
                {item.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
