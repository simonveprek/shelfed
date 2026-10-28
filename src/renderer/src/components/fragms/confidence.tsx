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
 * Confidence. A small mark of how sure an answer is, with the reason one
 * hover away. Put it after a claim, or beside a whole answer. Needs React
 * and Framer Motion. No Tailwind required. It takes its colours from the
 * text around it.
 *
 *   <p>
 *     The meeting moved to Thursday.
 *     <Confidence value={0.62} reason="Only one email says so." />
 *   </p>
 *
 * Fragms 2.1.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type ConfidenceLevel = "low" | "medium" | "high";

export type ConfidenceProps = {
  /** How sure, from 0 to 1. */
  value: number;
  /** Why it is that sure. A line, or a few. Shown on hover and tap. */
  reason?: string | string[];
  /** Three bars, a dot, a ring that fills, or the level in words. */
  look?: "bars" | "dot" | "ring" | "word";
  /** Shows the level's word beside the mark. The word look always does. */
  label?: boolean;
  /** The words for each level. Left out, Unsure, Fairly sure and Sure. */
  labels?: Partial<Record<ConfidenceLevel, string>>;
  /** Where medium and high begin, from 0 to 1. */
  thresholds?: [medium: number, high: number];
  /** Each level's colour. High follows the theme's accent when there is one. */
  colors?: Partial<Record<ConfidenceLevel, string>>;
  /** Shows the share as a number in the card. */
  percent?: boolean;
  /** Opens the card on hover, or only on a click. */
  trigger?: "hover" | "click";
  className?: string;
  style?: CSSProperties;
};

const WORDS: Record<ConfidenceLevel, string> = {
  low: "Unsure",
  medium: "Fairly sure",
  high: "Sure",
};
const COLORS: Record<ConfidenceLevel, string> = {
  low: "#ef4444",
  medium: "#f5a524",
  high: "#22b573",
};
const EASE = [0.22, 1, 0.36, 1] as const;
const WIDTH = 264;
const noSubscribe = () => () => {};

/** Which level a value falls in. */
export function confidenceLevel(
  value: number,
  thresholds: [number, number] = [0.45, 0.75],
): ConfidenceLevel {
  if (value >= thresholds[1]) return "high";
  if (value >= thresholds[0]) return "medium";
  return "low";
}

export function Confidence({
  value,
  reason,
  look = "bars",
  label = false,
  labels,
  thresholds = [0.45, 0.75],
  colors,
  percent = true,
  trigger = "hover",
  className,
  style,
}: ConfidenceProps) {
  const theme = useTheme();
  const pace = theme.pace ?? 1;
  const share = Math.min(1, Math.max(0, value));
  const level = confidenceLevel(share, thresholds);
  const color =
    colors?.[level] ??
    (level === "high" ? (theme.accent ?? COLORS.high) : COLORS[level]);
  const word = labels?.[level] ?? WORDS[level];
  const reasons = reason ? (Array.isArray(reason) ? reason : [reason]) : [];

  const [open, setOpen] = useState(false);
  const mark = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();
  const dark = useDarkText(mark);

  // A pointer passing over waits 80ms before the card opens, so a stray pass
  // does nothing. Leaving gives it a moment to reach the card.
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const intend = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 80);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 140);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // Escape puts the card away and hands focus back to the mark.
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      mark.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);
  const hover =
    trigger === "hover"
      ? { onPointerEnter: intend, onPointerLeave: hide }
      : undefined;
  const words = look === "word" || label;

  return (
    <>
      <button
        ref={mark}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${word}, ${Math.round(share * 100)} percent${reasons.length ? `. ${reasons.join(" ")}` : ""}`}
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
          gap: "0.4em",
          height: "1.55em",
          margin: "0 0.15em",
          padding: words ? "0 0.6em 0 0.45em" : "0 0.4em",
          border: 0,
          borderRadius: 9999,
          verticalAlign: "0.08em",
          background: `color-mix(in oklab, currentColor ${open ? 12 : words ? 7 : 0}%, transparent)`,
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
        <Mark
          look={look}
          level={level}
          share={share}
          color={color}
          pace={pace}
        />
        {words && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={word}
              style={{ opacity: 0.8 }}
              initial={{ opacity: 0, y: 3, filter: "blur(2px)" }}
              animate={{ opacity: 0.8, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -3, filter: "blur(2px)" }}
              transition={{ duration: 0.15 / pace, ease: "easeOut" }}
            >
              {word}
            </motion.span>
          </AnimatePresence>
        )}
      </button>

      <Floating anchor={mark} open={open}>
        {(place) => (
          <motion.div
            ref={card}
            id={id}
            role="dialog"
            aria-label={word}
            onPointerEnter={trigger === "hover" ? show : undefined}
            onPointerLeave={trigger === "hover" ? hide : undefined}
            initial={{ opacity: 0, scale: 0.97, y: place.below ? -4 : 4 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: 0.25 / pace, ease: EASE },
            }}
            exit={{
              opacity: 0,
              scale: 0.98,
              transition: { duration: 0.15 / pace, ease: EASE },
            }}
            style={{
              width: WIDTH,
              boxSizing: "border-box",
              padding: 14,
              transformOrigin: `${place.originX}px ${place.below ? "0%" : "100%"}`,
              borderRadius: rounded(16, theme),
              background: dark ? "#1b1b1b" : "#ffffff",
              color: dark ? "#f5f5f5" : "#0a0a0a",
              boxShadow: dark
                ? "0 0 0 1px rgba(255,255,255,0.08), 0 24px 48px -16px rgba(0,0,0,0.7)"
                : "0 0 0 1px rgba(0,0,0,0.06), 0 24px 48px -18px rgba(0,0,0,0.25)",
              fontSize: 13,
              lineHeight: 1.45,
              textAlign: "left",
              fontFamily: theme.font,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, display: "inline-flex" }}>
                <Mark
                  look="bars"
                  level={level}
                  share={share}
                  color={color}
                  pace={pace}
                />
              </span>
              <span style={{ fontWeight: 600 }}>{word}</span>
              {percent && (
                <span
                  style={{
                    marginLeft: "auto",
                    opacity: 0.5,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(share * 100)}%
                </span>
              )}
            </div>
            <div
              style={{
                position: "relative",
                height: 4,
                marginTop: 10,
                borderRadius: 9999,
                overflow: "hidden",
                background:
                  "color-mix(in oklab, currentColor 10%, transparent)",
              }}
            >
              <motion.span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 9999,
                  background: color,
                  transformOrigin: "left",
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: share }}
                transition={{ duration: 0.5 / pace, ease: EASE, delay: 0.05 }}
              />
            </div>
            {reasons.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  margin: "12px 0 0",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {reasons.map((line, i) => (
                  <motion.li
                    key={line}
                    style={{ display: "flex", gap: 8, opacity: 0.75 }}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 0.75, y: 0 }}
                    transition={{
                      duration: 0.25 / pace,
                      ease: EASE,
                      delay: (0.08 + i * 0.04) / pace,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: 4,
                        height: 4,
                        marginTop: 7,
                        borderRadius: 9999,
                        background: "currentColor",
                        opacity: 0.6,
                      }}
                    />
                    {line}
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </Floating>
    </>
  );
}

/** The mark itself, in whichever look. */
function Mark({
  look,
  level,
  share,
  color,
  pace,
}: {
  look: NonNullable<ConfidenceProps["look"]>;
  level: ConfidenceLevel;
  share: number;
  color: string;
  pace: number;
}) {
  const lit = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const off = "color-mix(in oklab, currentColor 20%, transparent)";

  if (look === "dot" || look === "word")
    return (
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          display: "inline-flex",
          width: "0.6em",
          height: "0.6em",
        }}
      >
        {/* An unsure answer keeps asking to be looked at, gently */}
        {level !== "high" && (
          <motion.span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 9999,
              background: color,
            }}
            animate={{ scale: [1, 2.2], opacity: [0.45, 0] }}
            transition={{
              duration: (level === "low" ? 1.4 : 2.4) / pace,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        )}
        <motion.span
          style={{ position: "absolute", inset: 0, borderRadius: 9999 }}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, backgroundColor: color }}
          transition={{ duration: 0.25 / pace, ease: EASE }}
        />
      </span>
    );

  if (look === "ring")
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        style={{ width: "1.05em", height: "1.05em", display: "block" }}
      >
        <circle
          cx="10"
          cy="10"
          r="7"
          fill="none"
          stroke={off}
          strokeWidth="3"
        />
        {/* Turned in place, so the fill starts at the top */}
        <g transform="rotate(-90 10 10)">
          <motion.circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ pathLength: 0, stroke: color }}
            animate={{ pathLength: Math.max(0.02, share), stroke: color }}
            transition={{ duration: 0.5 / pace, ease: EASE }}
          />
        </g>
      </svg>
    );

  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "flex-end",
        gap: "0.12em",
        height: "0.95em",
      }}
    >
      {[0.45, 0.7, 0.95].map((height, i) => (
        <motion.span
          key={i}
          style={{
            width: "0.2em",
            height: `${height}em`,
            borderRadius: 9999,
            transformOrigin: "bottom",
          }}
          initial={{ scaleY: 0.3, opacity: 0 }}
          animate={{
            scaleY: 1,
            opacity: 1,
            backgroundColor: i < lit ? color : off,
          }}
          transition={{
            duration: 0.25 / pace,
            ease: EASE,
            delay: (i * 0.04) / pace,
          }}
        />
      ))}
    </span>
  );
}

/** The mark alone, with no card, for a picture of a level. */
export function ConfidenceMark({
  value,
  look = "bars",
  thresholds = [0.45, 0.75],
  colors,
}: Pick<ConfidenceProps, "value" | "look" | "thresholds" | "colors">) {
  const theme = useTheme();
  const share = Math.min(1, Math.max(0, value));
  const level = confidenceLevel(share, thresholds);
  const color =
    colors?.[level] ??
    (level === "high" ? (theme.accent ?? COLORS.high) : COLORS[level]);
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <Mark
        look={look === "word" ? "dot" : look}
        level={level}
        share={share}
        color={color}
        pace={theme.pace ?? 1}
      />
    </span>
  );
}

type Place = { left: number; top: number; below: boolean; originX: number };

/**
 * Holds the card beside its mark, above when there is room and below when
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
      const mark = anchor.current?.getBoundingClientRect();
      if (!mark) return;
      const height = box.current?.offsetHeight || 140;
      const gap = 8;
      const below = mark.top - height - gap < 8;
      const left = Math.min(
        window.innerWidth - WIDTH - 8,
        Math.max(8, mark.left + mark.width / 2 - WIDTH / 2),
      );
      setPlace({
        left,
        top: below ? mark.bottom + gap : mark.top - height - gap,
        below,
        originX: mark.left + mark.width / 2 - left,
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
