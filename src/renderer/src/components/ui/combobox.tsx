"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Chevron } from "./accordion";
import { cx, EASE } from "./cx";
import { Icon } from "./icon";
import { Portal } from "./portal";

export type ComboboxOption<T extends string> = {
  id: T;
  /** Plain words, since typing searches them. */
  label: string;
  /** A short line under the label. */
  note?: ReactNode;
  /** Something small before the label, like an avatar or an icon. */
  lead?: ReactNode;
  /** More words it answers to, like an email or a team. */
  keywords?: string[];
  /** Options that share a group sit under its name. */
  group?: string;
  disabled?: boolean;
};

type Shared<T extends string> = {
  options: ComboboxOption<T>[];
  /** What it picks, for screen readers. */
  label: string;
  placeholder?: string;
  /** Shown when nothing matches what was typed. */
  empty?: ReactNode;
  size?: "sm" | "md";
  /** Posts the picked ids with a plain form, through hidden inputs. */
  name?: string;
  disabled?: boolean;
  className?: string;
};

type One<T extends string> = {
  multiple?: false;
  value: T | null;
  onChange: (value: T | null) => void;
};

type Many<T extends string> = {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
};

export type ComboboxProps<T extends string> = Shared<T> & (One<T> | Many<T>);

type Place = { left: number; top?: number; bottom?: number; width: number; above: boolean };

// Lowercase and without accents, so "dvorak" finds Dvořák.
const plain = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const matches = <T extends string>(option: ComboboxOption<T>, query: string) => {
  const words = plain(query).split(/\s+/).filter(Boolean);
  const hay = plain([option.label, ...(option.keywords ?? [])].join(" "));
  return words.every((word) => hay.includes(word));
};

/**
 * Type to find one or a few in a list. The list floats over the page in
 * 250ms and leaves in 150ms. The arrows move, Enter picks, Escape puts it
 * away. With multiple, picks sit in the field as chips and Backspace takes
 * the last one off.
 */
export function Combobox<T extends string>(props: ComboboxProps<T>) {
  const {
    options,
    label,
    placeholder = "Search",
    empty = "No matches",
    size = "md",
    name,
    disabled = false,
    className,
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // In single mode the field shows the pick, and while open it waits under
  // the caret as a hint until you type.
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  const picked: T[] = props.multiple
    ? props.value
    : props.value === null
      ? []
      : [props.value];
  const commit = (next: T[]) => {
    if (props.multiple) props.onChange(next);
    else props.onChange(next[0] ?? null);
  };
  const single = props.multiple
    ? undefined
    : options.find((option) => option.id === props.value);

  const search = props.multiple || typing ? query : "";
  const shown = options.filter((option) => matches(option, search));
  const usable = shown
    .map((option, i) => ({ option, i }))
    .filter(({ option }) => !option.disabled);
  const first = (from: ComboboxOption<T>[]) =>
    Math.max(
      0,
      from.findIndex((option) => !option.disabled),
    );

  const show = () => {
    if (disabled || open) return;
    const at = shown.findIndex((option) => option.id === picked[0]);
    setActive(at >= 0 && !props.multiple ? at : first(shown));
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    setTyping(false);
    setQuery("");
  };

  const choose = (option: ComboboxOption<T>) => {
    if (option.disabled) return;
    if (props.multiple) {
      commit(
        picked.includes(option.id)
          ? picked.filter((item) => item !== option.id)
          : [...picked, option.id],
      );
      if (query) {
        setQuery("");
        setActive(Math.max(0, options.indexOf(option)));
      }
    } else {
      commit([option.id]);
      hide();
    }
  };

  const type = (text: string) => {
    setQuery(text);
    setTyping(true);
    setActive(first(options.filter((option) => matches(option, text))));
    setOpen(true);
  };

  // Under the field when there is room, over it when there is not.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const box = field.current?.getBoundingClientRect();
      if (!box) return;
      const height = Math.min(296, list.current?.scrollHeight ?? 240);
      const above =
        box.bottom + 8 + height > window.innerHeight - 8 &&
        box.top - 8 - height > 8;
      setPlace({
        left: box.left,
        top: above ? undefined : box.bottom + 8,
        bottom: above ? window.innerHeight - box.top + 8 : undefined,
        width: box.width,
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
      if (!field.current?.contains(target) && !list.current?.contains(target))
        hide();
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
    if (usable.length === 0) return;
    const at = usable.findIndex(({ i }) => i === active);
    const next =
      at < 0
        ? usable[by > 0 ? 0 : usable.length - 1]
        : usable[(at + by + usable.length) % usable.length];
    setActive(next.i);
  };

  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else step(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = shown[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        hide();
      } else if (query) setQuery("");
    } else if (event.key === "Tab") {
      if (open) hide();
    } else if (
      event.key === "Backspace" &&
      props.multiple &&
      query === "" &&
      picked.length > 0
    ) {
      commit(picked.slice(0, -1));
    }
  };

  const labelOf = (item: T) =>
    options.find((option) => option.id === item)?.label ?? item;

  return (
    <>
      <div
        ref={field}
        onPointerDown={(event) => {
          if (disabled) return;
          // A press on the field, not the words, keeps the caret where it is.
          if (event.target !== input.current) event.preventDefault();
          input.current?.focus({ preventScroll: true });
          if (!open) show();
          else if (event.target !== input.current) hide();
        }}
        className={cx(
          "flex w-full cursor-text items-center gap-2 rounded-field border border-border bg-well pr-3 pl-3.5 text-label text-foreground transition-[border-color,background-color] duration-150 hover:border-line-strong has-[input:focus-visible]:border-line-strong",
          open && "border-line-strong",
          props.multiple
            ? cx("flex-wrap py-1 pl-1.5", size === "sm" ? "min-h-8" : "min-h-10")
            : size === "sm"
              ? "h-8"
              : "h-10",
          disabled && "pointer-events-none opacity-45",
          className,
        )}
      >
        {props.multiple &&
          picked.map((item) => (
            <span
              key={item}
              className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-full bg-control pr-0.5 pl-2.5 text-label"
            >
              <span className="truncate">{labelOf(item)}</span>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Remove ${labelOf(item)}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={() => commit(picked.filter((other) => other !== item))}
                className="flex size-5 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-control-hover hover:text-foreground"
              >
                <Icon icon={Cancel01Icon} size={11} strokeWidth={2.2} />
              </button>
            </span>
          ))}

        {!props.multiple && single?.lead && !typing && (
          <span className="flex shrink-0">{single.lead}</span>
        )}

        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={
            open && shown[active] ? `${id}-${active}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={
            props.multiple || typing || open ? query : (single?.label ?? "")
          }
          placeholder={
            props.multiple
              ? picked.length > 0
                ? undefined
                : placeholder
              : (single?.label ?? placeholder)
          }
          onChange={(event) => type(event.target.value)}
          onKeyDown={keys}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && (field.current?.contains(next) || list.current?.contains(next)))
              return;
            if (open || typing) hide();
          }}
          className={cx(
            "h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted",
            props.multiple && "h-7 min-w-16 pl-1",
          )}
        />

        {!props.multiple && single && !typing && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Clear ${label}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => commit([])}
            className="-mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-control hover:text-foreground"
          >
            <Icon icon={Cancel01Icon} size={12} strokeWidth={2.2} />
          </button>
        )}
        <Chevron
          open={open}
          className={cx("shrink-0 text-muted", props.multiple && "ml-auto mr-0.5")}
        />
      </div>

      {name &&
        picked.map((item) => (
          <input key={item} type="hidden" name={name} value={item} />
        ))}

      <Portal>
        <AnimatePresence>
          {open && place && (
            <motion.div
              ref={list}
              id={id}
              role="listbox"
              aria-label={label}
              aria-multiselectable={props.multiple || undefined}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { duration: 0.25, ease: EASE },
              }}
              exit={{
                opacity: 0,
                scale: 0.98,
                transition: { duration: 0.15, ease: EASE },
              }}
              style={{
                position: "fixed",
                left: place.left,
                top: place.top,
                bottom: place.bottom,
                width: place.width,
                transformOrigin: place.above ? "bottom left" : "top left",
              }}
              className="z-[90] max-h-[296px] overflow-y-auto overscroll-contain rounded-[18px] border border-border bg-card p-1.5 shadow-float"
            >
              {shown.length === 0 && (
                <p className="px-3 py-6 text-center text-label text-muted">
                  {empty}
                </p>
              )}
              {shown.map((option, i) => {
                const on = picked.includes(option.id);
                return (
                  <div key={option.id}>
                    {option.group && option.group !== shown[i - 1]?.group && (
                      <p className="px-3 pt-2.5 pb-1 text-caption font-medium text-muted">
                        {option.group}
                      </p>
                    )}
                    <div
                      id={`${id}-${i}`}
                      role="option"
                      aria-selected={on}
                      aria-disabled={option.disabled}
                      data-index={i}
                      onPointerDown={(event) => event.preventDefault()}
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
                        <span className="block truncate text-[14px]">
                          {option.label}
                        </span>
                        {option.note && (
                          <span className="block truncate text-caption text-muted">
                            {option.note}
                          </span>
                        )}
                      </span>
                      {on && (
                        <span className="flex shrink-0">
                          <Icon icon={Tick02Icon} size={14} strokeWidth={2.2} />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
