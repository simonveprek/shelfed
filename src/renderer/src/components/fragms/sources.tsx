"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { isLightColor, rounded, useTheme } from "./theme";

/**
 * Sources. Where an answer came from, without leaving it. Cite puts a small
 * chip in the text, and pointing at it opens a preview of the page. Sources
 * gathers every page behind an answer into a row of icons that opens into a
 * list. Needs React and Framer Motion. No Tailwind required. It takes its
 * colours from the text around it.
 *
 *   <p>
 *     Voice apps feel faster when they answer at once.
 *     <Cite source={pages[0]} />
 *   </p>
 *   <Sources sources={pages} />
 *
 * Fragms 2.1.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type Source = {
  url: string;
  title: string;
  /** A line or two from the page. */
  snippet?: string;
  /** The site's name. Left out, it comes from the address. */
  site?: string;
  /** The site's icon. Left out, a letter in a colour of its own. */
  icon?: string;
  /** A picture from the page, shown at the top of the preview. */
  image?: string;
  /** When it was published, as you want it to read. */
  date?: string;
};

export type CiteProps = {
  /** One page, or several behind the same claim. */
  source: Source | Source[];
  /** Its number, for the number look. */
  index?: number;
  /** The site's name with its icon, or a small number. */
  look?: "site" | "number";
  /** Opens the preview on hover, or only on a click. */
  trigger?: "hover" | "click";
  /** Shows the page's picture in the preview, when it has one. */
  images?: boolean;
  /** A soft fill, a thin outline, or nothing until it is pointed at. */
  variant?: "soft" | "outline" | "plain";
  className?: string;
  style?: CSSProperties;
};

export type SourcesProps = {
  sources: Source[];
  /** How many icons show before the count takes over. */
  max?: number;
  /** Starts with the list open. */
  defaultOpen?: boolean;
  /** Words after the count. Left out, sources. */
  label?: string;
  /** The list as cards in a grid, or as plain rows. */
  layout?: "grid" | "list";
  className?: string;
  style?: CSSProperties;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const noSubscribe = () => () => {};

/* ------------------------------------------------------------------------ */
/* Cite                                                                      */
/* ------------------------------------------------------------------------ */

export function Cite({
  source,
  index,
  look = "site",
  trigger = "hover",
  images = true,
  variant = "soft",
  className,
  style,
}: CiteProps) {
  const theme = useTheme();
  const list = Array.isArray(source) ? source : [source];
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const chip = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const leave = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();
  const dark = useDarkText(chip);
  const first = list[0];
  if (!first) return null;

  // A pointer passing over waits 80ms before the card opens, so a stray pass
  // does nothing. Leaving gives it a moment to reach the card.
  const show = () => {
    clearTimeout(leave.current);
    setOpen(true);
  };
  const intend = () => {
    clearTimeout(leave.current);
    leave.current = setTimeout(() => setOpen(true), 80);
  };
  const hide = () => {
    clearTimeout(leave.current);
    leave.current = setTimeout(() => setOpen(false), 140);
  };
  const hover =
    trigger === "hover"
      ? { onPointerEnter: intend, onPointerLeave: hide }
      : undefined;

  return (
    <>
      <button
        ref={chip}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Source, ${list.map((item) => siteName(item)).join(", ")}`}
        onClick={() => (open ? setOpen(false) : show())}
        onFocus={trigger === "hover" ? show : undefined}
        onBlur={(event) => {
          if (!card.current?.contains(event.relatedTarget as Node)) hide();
        }}
        {...hover}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35em",
          height: "1.55em",
          minWidth: look === "number" ? "1.55em" : undefined,
          margin: "0 0.15em",
          padding: look === "number" ? "0 0.45em" : "0 0.55em 0 0.3em",
          justifyContent: "center",
          border: 0,
          borderRadius: 9999,
          verticalAlign: "0.08em",
          background: `color-mix(in oklab, currentColor ${open ? 14 : variant === "soft" ? 8 : 0}%, transparent)`,
          boxShadow:
            variant === "outline"
              ? "inset 0 0 0 1px color-mix(in oklab, currentColor 18%, transparent)"
              : undefined,
          color: "inherit",
          font: "inherit",
          fontSize: "0.74em",
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: "nowrap",
          cursor: "pointer",
          transition: "background 150ms ease-out",
          ...style,
        }}
      >
        {look === "number" ? (
          <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>
            {index ?? 1}
          </span>
        ) : (
          <>
            <Favicon source={first} size="1.15em" />
            <span style={{ opacity: 0.8 }}>{siteName(first)}</span>
            {list.length > 1 && (
              <span style={{ opacity: 0.45 }}>+{list.length - 1}</span>
            )}
          </>
        )}
      </button>
      <Floating anchor={chip} open={open}>
        {(place) => (
          <motion.div
            ref={card}
            id={id}
            role="dialog"
            aria-label={first.title}
            onPointerEnter={trigger === "hover" ? show : undefined}
            onPointerLeave={trigger === "hover" ? hide : undefined}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition: { duration: 0.15, ease: "easeOut" },
            }}
            exit={{
              opacity: 0,
              scale: 0.98,
              transition: { duration: 0.05, ease: "easeOut" },
            }}
            style={{
              width: 320,
              transformOrigin: `${place.originX}px ${place.below ? "0%" : "100%"}`,
              borderRadius: rounded(18, theme),
              overflow: "hidden",
              fontFamily: theme.font,
              background: dark ? "#1b1b1b" : "#ffffff",
              color: dark ? "#f5f5f5" : "#0a0a0a",
              boxShadow: `0 0 0 1px ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}, 0 22px 50px -18px rgba(0,0,0,${dark ? 0.75 : 0.28})`,
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.a
                key={page}
                href={list[page].url}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, x: 8, filter: "blur(3px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -8, filter: "blur(3px)" }}
                transition={{ duration: 0.25, ease: EASE }}
                style={{
                  display: "block",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <Preview source={list[page]} image={images} />
              </motion.a>
            </AnimatePresence>
            {list.length > 1 && (
              <Pager at={page} count={list.length} onChange={setPage} />
            )}
          </motion.div>
        )}
      </Floating>
    </>
  );
}

function Preview({ source, image }: { source: Source; image: boolean }) {
  return (
    <>
      {image && source.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source.image}
          alt=""
          style={{
            display: "block",
            width: "100%",
            height: 132,
            objectFit: "cover",
          }}
        />
      )}
      <div style={{ padding: "14px 16px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
          }}
        >
          <Favicon source={source} size={18} />
          <span style={{ fontWeight: 500 }}>{siteName(source, true)}</span>
          {source.date && <span style={{ opacity: 0.45 }}>{source.date}</span>}
        </div>
        <div
          style={{
            marginTop: 9,
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            ...clampLines(2),
          }}
        >
          {source.title}
        </div>
        {source.snippet && (
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              lineHeight: 1.45,
              opacity: 0.6,
              ...clampLines(3),
            }}
          >
            {source.snippet}
          </div>
        )}
      </div>
    </>
  );
}

function Pager({
  at,
  count,
  onChange,
}: {
  at: number;
  count: number;
  onChange: (page: number) => void;
}) {
  const arrow = (back: boolean) => (
    <button
      type="button"
      aria-label={back ? "Previous source" : "Next source"}
      onClick={() => onChange((at + (back ? -1 : 1) + count) % count)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        border: 0,
        borderRadius: 9999,
        background: "color-mix(in oklab, currentColor 7%, transparent)",
        color: "inherit",
        cursor: "pointer",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d={back ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 12px 12px 16px",
      }}
    >
      <span style={{ display: "flex", gap: 4, flex: 1 }}>
        {Array.from({ length: count }, (_, i) => (
          <motion.span
            key={i}
            animate={{
              width: i === at ? 14 : 5,
              opacity: i === at ? 0.8 : 0.25,
            }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{
              height: 5,
              borderRadius: 9999,
              background: "currentColor",
            }}
          />
        ))}
      </span>
      {arrow(true)}
      {arrow(false)}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Sources                                                                   */
/* ------------------------------------------------------------------------ */

export function Sources({
  sources,
  max = 4,
  defaultOpen = false,
  label = "sources",
  layout = "grid",
  className,
  style,
}: SourcesProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const shown = sources.slice(0, max);

  return (
    <div className={className} style={style}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((now) => !now)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          height: 36,
          padding: "0 12px 0 8px",
          border: 0,
          borderRadius: 9999,
          background: `color-mix(in oklab, currentColor ${open ? 10 : 6}%, transparent)`,
          color: "inherit",
          font: "inherit",
          fontSize: 13.5,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 150ms ease-out",
        }}
      >
        {/* The icons fan out a little while the list is open */}
        <span style={{ display: "flex" }}>
          {shown.map((source, i) => (
            <motion.span
              key={source.url}
              animate={{ marginLeft: i === 0 ? 0 : open ? -2 : -7 }}
              // Each icon lifts on hover and settles back with a little spring.
              whileHover={{
                y: -4,
                scale: 1.05,
                transition: { duration: 0.32, ease: EASE },
              }}
              transition={{
                duration: 0.25,
                ease: EASE,
                y: { duration: 0.32, ease: [0.34, 3.85, 0.64, 1] },
                scale: { duration: 0.32, ease: [0.34, 3.85, 0.64, 1] },
              }}
              style={{
                display: "flex",
                borderRadius: 9999,
                zIndex: shown.length - i,
              }}
            >
              <Favicon source={source} size={20} round />
            </motion.span>
          ))}
        </span>
        <span>
          {sources.length} {label}
        </span>
        <motion.svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
          animate={{ scaleY: open ? -1 : 1 }}
          transition={{ duration: 0.25, ease: EASE }}
          style={{ opacity: 0.5 }}
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <ol
              style={{
                display: "grid",
                gridTemplateColumns:
                  layout === "grid"
                    ? "repeat(auto-fill, minmax(200px, 1fr))"
                    : "1fr",
                gap: layout === "grid" ? 8 : 0,
                margin: 0,
                padding: "10px 0 0",
                listStyle: "none",
              }}
            >
              {sources.map((source, i) => (
                <motion.li
                  key={source.url}
                  initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{
                    duration: 0.5,
                    delay: Math.min(i, 7) * 0.04,
                    ease: EASE,
                  }}
                >
                  {layout === "list" ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        padding: "7px 8px",
                        borderRadius: rounded(12, theme),
                        color: "inherit",
                        textDecoration: "none",
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          fontSize: 12,
                          textAlign: "right",
                          opacity: 0.35,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {i + 1}
                      </span>
                      <Favicon source={source} size={18} />
                      <span
                        style={{
                          minWidth: 0,
                          fontSize: 13.5,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {source.title}
                      </span>
                      <span
                        style={{
                          marginLeft: "auto",
                          flexShrink: 0,
                          fontSize: 12,
                          opacity: 0.45,
                        }}
                      >
                        {siteName(source, true)}
                      </span>
                    </a>
                  ) : (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        height: "100%",
                        boxSizing: "border-box",
                        padding: "11px 13px 12px",
                        borderRadius: rounded(14, theme),
                        background:
                          "color-mix(in oklab, currentColor 4%, transparent)",
                        boxShadow:
                          "inset 0 0 0 1px color-mix(in oklab, currentColor 8%, transparent)",
                        color: "inherit",
                        textDecoration: "none",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          fontSize: 12,
                        }}
                      >
                        <Favicon source={source} size={16} />
                        <span style={{ opacity: 0.6 }}>
                          {siteName(source, true)}
                        </span>
                        <span
                          style={{
                            marginLeft: "auto",
                            opacity: 0.35,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {i + 1}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          lineHeight: 1.3,
                          ...clampLines(2),
                        }}
                      >
                        {source.title}
                      </span>
                    </a>
                  )}
                </motion.li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Parts                                                                     */
/* ------------------------------------------------------------------------ */

/** The site's icon, or its first letter on a colour made from its name. */
export function Favicon({
  source,
  size = 16,
  round = false,
}: {
  source: Pick<Source, "url" | "icon" | "site">;
  size?: number | string;
  round?: boolean;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const host = hostOf(source.url);
  const radius = round ? 9999 : "28%";
  if (source.icon && broken !== source.icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source.icon}
        alt=""
        width={typeof size === "number" ? size : undefined}
        height={typeof size === "number" ? size : undefined}
        onError={() => setBroken(source.icon ?? null)}
        style={{
          display: "block",
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: radius,
          objectFit: "cover",
          background: "#fff",
        }}
      />
    );
  }
  const hue =
    [...host].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <span
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius,
        background: `oklch(0.62 0.14 ${hue})`,
        color: "#fff",
        fontSize: `calc(${typeof size === "number" ? `${size}px` : size} * 0.55)`,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {(source.site ?? siteName(source as Source)).charAt(0).toUpperCase()}
    </span>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The site's name, from the address when none is given. Short for chips. */
function siteName(source: Source, full = false) {
  if (source.site) return source.site;
  const host = hostOf(source.url);
  if (full) return host;
  const parts = host.split(".");
  return parts.length > 1 ? parts[parts.length - 2] : host;
}

function clampLines(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

type Place = { left: number; top: number; below: boolean; originX: number };

/**
 * Holds a card beside its anchor, above when there is room and below when
 * not, inside the screen. Rendered at the end of the page, so nothing clips it.
 */
function Floating({
  anchor,
  open,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  children: (place: Place) => ReactNode;
}) {
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [place, setPlace] = useState<Place | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const chip = anchor.current?.getBoundingClientRect();
      if (!chip) return;
      const width = 320;
      const height = box.current?.offsetHeight || 200;
      const gap = 8;
      const below = chip.top - height - gap < 8;
      const left = Math.min(
        window.innerWidth - width - 8,
        Math.max(8, chip.left + chip.width / 2 - width / 2),
      );
      setPlace({
        left,
        top: below ? chip.bottom + gap : chip.top - height - gap,
        below,
        originX: chip.left + chip.width / 2 - left,
      });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, anchor]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && place && (
        <div
          ref={box}
          style={{
            position: "fixed",
            left: place.left,
            top: place.top,
            zIndex: 60,
          }}
        >
          {children(place)}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** True when the text around it is light, so the card gets a dark surface. */
function useDarkText(element: RefObject<HTMLElement | null>) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => {
      const node = element.current;
      if (!node) return;
      setDark(isLightColor(getComputedStyle(node).color));
    };
    const frame = requestAnimationFrame(read);
    const watcher = new MutationObserver(() => requestAnimationFrame(read));
    watcher.observe(document.documentElement, { attributes: true });
    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
    };
  }, [element]);
  return dark;
}
