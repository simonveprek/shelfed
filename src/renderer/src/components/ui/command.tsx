"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Kbd } from "./badge";
import { cx } from "./cx";
import { Dialog } from "./dialog";
import { Icon, type IconLike } from "./icon";

export type CommandItem = {
  id: string;
  label: string;
  /** Items that share a group sit under its name, in the order given. */
  group?: string;
  icon?: IconLike;
  /** A quiet word on the right, like where it goes. */
  hint?: ReactNode;
  /** The keys that do the same thing. */
  shortcut?: ReactNode;
  /** More words it is found by. */
  keywords?: string[];
  disabled?: boolean;
  onSelect: () => void;
};

// Every word typed has to be somewhere in the label, keywords or group.
const matches = (item: CommandItem, query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [item.label, item.group, ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return words.every((word) => text.includes(word));
};

/**
 * A search over a list of things to do. Typing narrows it, the arrows move,
 * Enter runs the one that is lit. Use it on its own in a page, or in
 * Command for the palette that opens with a shortcut.
 */
export function CommandList({
  items,
  label = "Commands",
  placeholder = "Search",
  empty = "No results",
  onPick,
  inputRef,
  autoFocus = false,
  framed = true,
  className,
}: {
  items: CommandItem[];
  /** What the list holds, read out by screen readers. */
  label?: string;
  placeholder?: string;
  /** Shown when nothing matches. */
  empty?: ReactNode;
  /** Runs after an item's own onSelect, like closing the palette. */
  onPick?: (item: CommandItem) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  /** On its own card. Off inside a dialog, which is the card. */
  framed?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  // Grouped in the order each group first appears.
  const found = items.filter((item) => matches(item, query));
  const names = [...new Set(found.map((item) => item.group))];
  const ordered = names.flatMap((name) =>
    found.filter((item) => item.group === name),
  );
  const groups = names.map((name) => ({
    name,
    items: ordered
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.group === name),
  }));
  const usable = ordered
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !item.disabled);
  const current = usable.some(({ i }) => i === active)
    ? active
    : (usable[0]?.i ?? -1);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const pick = (item: CommandItem) => {
    if (item.disabled) return;
    item.onSelect();
    onPick?.(item);
  };

  const step = (by: number) => {
    if (usable.length === 0) return;
    const at = usable.findIndex(({ i }) => i === current);
    setActive(usable[(at + by + usable.length) % usable.length].i);
  };

  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = ordered[current];
      if (item) pick(item);
    } else if (event.key === "Escape" && query && framed) {
      event.preventDefault();
      setQuery("");
      setActive(0);
    }
  };

  return (
    <div
      className={cx(
        "flex flex-col",
        framed &&
          "overflow-hidden rounded-panel border border-border bg-card shadow-card",
        className,
      )}
    >
      <label className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5 text-muted">
        <Icon icon={Search01Icon} size={18} />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}list`}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? `${id}${current}` : undefined}
          aria-label={label}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={keys}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted"
        />
      </label>
      <div
        ref={list}
        id={`${id}list`}
        role="listbox"
        aria-label={label}
        className="max-h-[min(340px,50vh)] overflow-y-auto overscroll-contain p-1.5"
      >
        {groups.map((group) => (
          <div
            key={group.name ?? ""}
            role="group"
            aria-label={group.name}
            className="pb-1 last:pb-0"
          >
            {group.name && (
              <p
                aria-hidden="true"
                className="px-3 pt-2.5 pb-1 text-caption font-medium text-muted"
              >
                {group.name}
              </p>
            )}
            {group.items.map(({ item, i }) => {
              return (
                <div
                  key={item.id}
                  id={`${id}${i}`}
                  role="option"
                  aria-selected={i === current}
                  aria-disabled={item.disabled}
                  data-index={i}
                  onPointerMove={() =>
                    !item.disabled && i !== current && setActive(i)
                  }
                  onClick={() => pick(item)}
                  className={cx(
                    "flex h-11 cursor-pointer items-center gap-3 rounded-item px-3 transition-colors duration-100",
                    i === current && "bg-control",
                    item.disabled && "cursor-default opacity-45",
                  )}
                >
                  {item.icon != null && (
                    <span className="flex shrink-0 text-muted">
                      <Icon icon={item.icon} size={16} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                    {item.label}
                  </span>
                  {item.hint != null && (
                    <span className="shrink-0 truncate text-label text-muted">
                      {item.hint}
                    </span>
                  )}
                  {item.shortcut != null && (
                    <Kbd className="shrink-0">{item.shortcut}</Kbd>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {ordered.length === 0 && (
          <p className="px-3 py-10 text-center text-[14px] text-muted">
            {empty}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The command palette. A search near the top of the page over everything
 * you can do or go to. Cmd K or Ctrl K opens and closes it, Escape and a
 * click away close it, and running an item closes it too.
 */
export function Command({
  open,
  onOpenChange,
  items,
  label = "Command menu",
  placeholder = "Search or jump to",
  empty,
  hotkey = "k",
  hints = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  label?: string;
  placeholder?: string;
  empty?: ReactNode;
  /** The letter that opens it with Cmd or Ctrl. False for none. */
  hotkey?: string | false;
  /** The keys to use, along the bottom on larger screens. */
  hints?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hotkey) return;
    const listen = (event: globalThis.KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === hotkey
      ) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, [hotkey, open, onOpenChange]);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      label={label}
      position="top"
      initialFocus={input}
      className="sm:max-w-[560px]"
    >
      <CommandList
        items={items}
        label={label}
        placeholder={placeholder}
        empty={empty}
        inputRef={input}
        framed={false}
        onPick={() => onOpenChange(false)}
      />
      {hints && (
        <div className="hidden h-11 items-center gap-4 border-t border-border px-5 text-caption text-muted sm:flex">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            Move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            Run
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            Close
          </span>
        </div>
      )}
    </Dialog>
  );
}
