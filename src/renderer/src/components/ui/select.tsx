"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { Chevron } from "./accordion";
import { cx, EASE } from "./cx";
import { Icon } from "./icon";
import { Portal } from "./portal";

export type SelectOption<T extends string> = {
  id: T;
  label: ReactNode;
  /** A short line under the label. */
  note?: ReactNode;
  /** Something small before the label, like a swatch or an icon. */
  lead?: ReactNode;
  /** How the label is drawn, here and in the field once picked. */
  style?: CSSProperties;
  /** Options that share a group sit under its name. */
  group?: string;
  disabled?: boolean;
};

type Place = { left: number; top: number; width: number; above: boolean };

/**
 * Pick one from a list. It looks like a field and shows what is picked. The
 * list floats over the page in 250ms and leaves in 150ms, so no panel clips
 * it. The arrows move, Home and End jump, typing a letter finds the option
 * that starts with it, Enter picks and Escape puts it away.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  placeholder = "Pick one",
  size = "md",
  name,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  /** What it picks, for screen readers. */
  label: string;
  placeholder?: string;
  size?: "sm" | "md";
  /** Posts the picked id with a plain form, through a hidden input. */
  name?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const id = useId();
  const picked = options.find((option) => option.id === value);
  const usable = options
    .map((option, i) => ({ option, i }))
    .filter(({ option }) => !option.disabled);

  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.id === value),
      ),
    );
    setOpen(true);
  };
  const hide = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus({ preventScroll: true });
  };
  const choose = (option: SelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.id);
    hide();
  };

  // Under the field when there is room, over it when there is not.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box) return;
      const height = Math.min(320, list.current?.scrollHeight ?? 240);
      const above =
        box.bottom + 8 + height > window.innerHeight - 8 &&
        box.top - 8 - height > 8;
      setPlace({
        left: box.left,
        top: above ? box.top - 8 - height : box.bottom + 8,
        width: Math.max(box.width, 200),
        above,
      });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  // A press anywhere else puts it away.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !list.current?.contains(target))
        hide(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  });

  // The active option stays in view as the arrows move through a long list.
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const step = (by: number) => {
    const at = usable.findIndex(({ i }) => i === active);
    const next = usable[(at + by + usable.length) % usable.length];
    if (next) setActive(next.i);
  };

  const keys = (event: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(usable[0]?.i ?? 0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(usable[usable.length - 1]?.i ?? 0);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    } else if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      hide(event.key === "Escape");
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Letters typed close together build a word to find.
      const now = Date.now();
      typed.current = {
        text:
          (now - typed.current.at < 600 ? typed.current.text : "") +
          event.key.toLowerCase(),
        at: now,
      };
      const found = usable.find(({ option }) =>
        String(option.label).toLowerCase().startsWith(typed.current.text),
      );
      if (found) setActive(found.i);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? hide() : show())}
        onKeyDown={keys}
        className={cx(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-field border border-border bg-well px-3.5 text-left text-label text-foreground transition-[border-color,background-color] duration-150 outline-none hover:border-line-strong focus-visible:border-line-strong",
          open && "border-line-strong",
          size === "sm" ? "h-8" : "h-10",
          className,
        )}
      >
        {picked?.lead && <span className="flex shrink-0">{picked.lead}</span>}
        <span
          className={cx("min-w-0 flex-1 truncate", !picked && "text-muted")}
          style={picked?.style}
        >
          {picked ? picked.label : placeholder}
        </span>
        <Chevron open={open} className="shrink-0 text-muted" />
      </button>
      {name && <input type="hidden" name={name} value={value} />}

      <Portal>
        <AnimatePresence>
          {open && place && (
            <motion.div
              ref={list}
              id={id}
              role="listbox"
              aria-label={label}
              initial={{ opacity: 0, scale: 0.97, y: place.above ? 4 : -4 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                transition: { duration: 0.25, ease: EASE },
              }}
              exit={{
                opacity: 0,
                scale: 0.99,
                transition: { duration: 0.15, ease: EASE },
              }}
              style={{
                position: "fixed",
                left: place.left,
                top: place.top,
                width: place.width,
                transformOrigin: place.above ? "bottom left" : "top left",
              }}
              className="z-[90] max-h-[320px] overflow-y-auto rounded-[16px] border border-border bg-card p-1.5 shadow-float"
            >
              {options.map((option, i) => (
                <div key={option.id}>
                  {option.group && option.group !== options[i - 1]?.group && (
                    <p className="px-3 pt-2.5 pb-1 text-caption font-medium text-muted">
                      {option.group}
                    </p>
                  )}
                  <div
                    id={`${id}-${i}`}
                    role="option"
                    aria-selected={option.id === value}
                    aria-disabled={option.disabled}
                    data-index={i}
                    onPointerMove={() =>
                      !option.disabled && i !== active && setActive(i)
                    }
                    onClick={() => choose(option)}
                    className={cx(
                      "flex cursor-pointer items-center gap-2.5 rounded-item px-3 py-2 transition-colors duration-100",
                      i === active && "bg-control",
                      option.disabled && "cursor-default opacity-45",
                    )}
                  >
                    {option.lead && (
                      <span className="flex shrink-0">{option.lead}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[14px]"
                        style={option.style}
                      >
                        {option.label}
                      </span>
                      {option.note && (
                        <span className="block truncate text-caption text-muted">
                          {option.note}
                        </span>
                      )}
                    </span>
                    {option.id === value && (
                      <span className="flex shrink-0">
                        <Icon icon={Tick02Icon} size={14} strokeWidth={2.2} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
