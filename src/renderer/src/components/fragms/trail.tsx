"use client";

import { useId, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "./theme";

/**
 * Trail. An agent browsing the web, so people can watch it work instead of
 * waiting on a spinner. Each page it opens joins a trail of site icons, and
 * the one it is reading shows as a small card with its title and a line of
 * light passing over the text. Once it is done, the trail folds into a short
 * summary that opens into the list of pages. Needs React and Framer Motion.
 * No Tailwind required. It takes its colours from the text around it.
 *
 *   <Trail pages={visited} busy={browsing} />
 *
 * Fragms 2.1.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type TrailPage = {
  url: string;
  title?: string;
  /** A line or two from the page, shown while it is read. */
  snippet?: string;
  /** The site's icon. Left out, a letter in a colour of its own. */
  icon?: string;
  /** The site's name. Left out, it comes from the address. */
  site?: string;
};

export type TrailProps = {
  /** The pages so far, in order. While busy, the last is the one being read. */
  pages: TrailPage[];
  /** Still browsing. */
  busy?: boolean;
  /** The words over the trail while it works. Left out, it says what it reads. */
  status?: string;
  /** The words once done. Left out, how many pages it read. */
  summary?: string;
  /** Shows a card for the page being read. */
  preview?: boolean;
  /** Folds into a summary once done. Off, the trail stays. */
  collapse?: boolean;
  /** How many icons the trail shows before the rest become a count. */
  max?: number;
  /** The ring round the page being read. Left out, the text colour. */
  color?: string;
  /** Round icons, or squares with soft corners. */
  icons?: "round" | "square";
  /** A thin line joining each page to the next. */
  line?: boolean;
  className?: string;
  style?: CSSProperties;
};

const EASE = [0.22, 1, 0.36, 1] as const;

// The words shimmer by a mask, so they keep whatever colour the page gives them.
const SHINE = `@keyframes fragms-trail-shine{from{-webkit-mask-position:150% 0;mask-position:150% 0}to{-webkit-mask-position:-50% 0;mask-position:-50% 0}}`;

export function Trail({
  pages,
  busy = false,
  status,
  summary,
  preview = true,
  collapse = true,
  max = 7,
  color: colorProp,
  icons: iconsProp,
  line = true,
  className,
  style,
}: TrailProps) {
  const theme = useTheme();
  const color = colorProp ?? theme.accent ?? "currentColor";
  const icons =
    iconsProp ?? ((theme.roundness ?? 1) < 0.5 ? "square" : "round");
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const current = busy ? pages[pages.length - 1] : undefined;
  const folded = !busy && collapse && pages.length > 0;
  const words = busy
    ? (status ??
      (current ? `Reading ${hostOf(current.url)}` : "Searching the web"))
    : (summary ??
      `Read ${pages.length} ${pages.length === 1 ? "page" : "pages"}`);

  return (
    <div
      className={className}
      style={{ display: "flex", flexDirection: "column", gap: 12, ...style }}
    >
      <style>{SHINE}</style>

      {folded ? (
        <Summary
          pages={pages}
          words={words}
          open={open}
          onToggle={() => setOpen((now) => !now)}
        />
      ) : (
        <>
          <Status words={words} busy={busy} reduced={reduced} />

          <AnimatePresence initial={false}>
            {preview && current && (
              <motion.div
                key="card"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                style={{ overflow: "hidden" }}
              >
                <Card page={current} reduced={reduced} />
              </motion.div>
            )}
          </AnimatePresence>

          {pages.length > 0 && (
            <Row
              pages={pages}
              busy={busy}
              max={max}
              color={color}
              icons={icons}
              line={line}
              reduced={reduced}
            />
          )}
        </>
      )}
    </div>
  );
}

/** The line over the trail. It shimmers while the agent works. */
function Status({
  words,
  busy,
  reduced,
}: {
  words: string;
  busy: boolean;
  reduced: boolean;
}) {
  const shine = busy && !reduced;
  return (
    <div style={{ position: "relative", height: 20, overflow: "hidden" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words}
          initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(2px)" }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
          style={{
            display: "block",
            fontSize: 14,
            fontWeight: 500,
            lineHeight: "20px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            opacity: busy ? 1 : 0.7,
            ...(shine
              ? {
                  WebkitMaskImage:
                    "linear-gradient(90deg, rgba(0,0,0,0.4) 30%, #000 50%, rgba(0,0,0,0.4) 70%)",
                  maskImage:
                    "linear-gradient(90deg, rgba(0,0,0,0.4) 30%, #000 50%, rgba(0,0,0,0.4) 70%)",
                  WebkitMaskSize: "250% 100%",
                  maskSize: "250% 100%",
                  animation: "fragms-trail-shine 2s linear infinite",
                }
              : null),
          }}
        >
          {words}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/** The page being read, with a line of light passing down its words. */
function Card({ page, reduced }: { page: TrailPage; reduced: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 16,
        background: "color-mix(in oklab, currentColor 4%, transparent)",
        boxShadow:
          "inset 0 0 0 1px color-mix(in oklab, currentColor 9%, transparent)",
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={page.url}
          initial={{ opacity: 0, x: 8, filter: "blur(3px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: -8, filter: "blur(3px)" }}
          transition={{ duration: 0.25, ease: EASE }}
          style={{ padding: "13px 15px 15px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
            }}
          >
            <Favicon page={page} size={16} />
            <span
              style={{
                opacity: 0.55,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayUrl(page.url)}
            </span>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 15,
              fontWeight: 500,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
            }}
          >
            {page.title ?? siteName(page)}
          </div>
          <div style={{ marginTop: 7 }}>
            {page.snippet ? (
              <Reading text={page.snippet} reduced={reduced} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {[92, 78, 54].map((width, i) => (
                  <motion.span
                    key={width}
                    animate={reduced ? undefined : { opacity: [1, 0.5, 1] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                      delay: i * 0.08,
                    }}
                    style={{
                      width: `${width}%`,
                      height: 8,
                      borderRadius: 9999,
                      background:
                        "color-mix(in oklab, currentColor 10%, transparent)",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * The words of the page, resolving one by one through a soft blur as the
 * agent reads them. They sit faintly in place from the start, so nothing
 * shifts as they firm up.
 */
function Reading({ text, reduced }: { text: string; reduced: boolean }) {
  const words = text.split(" ");
  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.5,
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={reduced ? false : { opacity: 0.16, filter: "blur(1px)" }}
          animate={{ opacity: 0.62, filter: "blur(0px)" }}
          transition={{ duration: 0.35, delay: 0.25 + i * 0.06, ease: EASE }}
        >
          {word}{" "}
        </motion.span>
      ))}
    </div>
  );
}

/** The icons of every page so far, joined by a line that draws itself. */
function Row({
  pages,
  busy,
  max,
  color,
  icons,
  line,
  reduced,
}: {
  pages: TrailPage[];
  busy: boolean;
  max: number;
  color: string;
  icons: "round" | "square";
  line: boolean;
  reduced: boolean;
}) {
  const round = icons === "round";
  const hidden = Math.max(0, pages.length - max);
  const shown = pages.slice(hidden);
  return (
    <div style={{ display: "flex", alignItems: "center", minHeight: 32 }}>
      {hidden > 0 && (
        <span
          style={{
            marginRight: 8,
            fontSize: 12,
            fontWeight: 500,
            opacity: 0.45,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          +{hidden}
        </span>
      )}
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((page, i) => {
          const reading = busy && i === shown.length - 1;
          return (
            <motion.span
              key={page.url}
              layout
              initial={{ opacity: 0, scale: 0.25, filter: "blur(2px)" }}
              animate={{
                opacity: 1,
                scale: 1,
                filter: "blur(0px)",
                transition: { duration: 0.5, ease: [0.34, 1.36, 0.64, 1] },
              }}
              exit={{
                opacity: 0,
                scale: 0.25,
                transition: { duration: 0.15, ease: EASE },
              }}
              transition={{ duration: 0.25, ease: EASE }}
              style={{ display: "flex", alignItems: "center" }}
            >
              {i > 0 && !line && <span style={{ width: 6 }} />}
              {i > 0 && line && (
                <motion.span
                  aria-hidden="true"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  style={{
                    width: 14,
                    height: 1.5,
                    margin: "0 4px",
                    borderRadius: 9999,
                    transformOrigin: "left center",
                    background:
                      "color-mix(in oklab, currentColor 18%, transparent)",
                  }}
                />
              )}
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                title={page.title ?? hostOf(page.url)}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  borderRadius: round ? 9999 : 9,
                  background:
                    "color-mix(in oklab, currentColor 6%, transparent)",
                  opacity: reading || !busy ? 1 : 0.6,
                  transition: "opacity 250ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <Favicon page={page} size={16} />
                {reading && (
                  // A short arc running round the edge, whatever its shape.
                  <svg
                    viewBox="0 0 36 36"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: -3,
                      width: 36,
                      height: 36,
                      overflow: "visible",
                    }}
                  >
                    <motion.rect
                      x="1.5"
                      y="1.5"
                      width="33"
                      height="33"
                      rx={round ? 16.5 : 11}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      pathLength={100}
                      strokeDasharray="24 76"
                      initial={{ strokeDashoffset: 0 }}
                      animate={
                        reduced ? undefined : { strokeDashoffset: [0, -100] }
                      }
                      transition={{
                        duration: 1.1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  </svg>
                )}
              </a>
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Once done, a short line with the icons stacked, opening into the list. */
function Summary({
  pages,
  words,
  open,
  onToggle,
}: {
  pages: TrailPage[];
  words: string;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          height: 34,
          padding: "0 12px 0 7px",
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
        <span style={{ display: "flex" }}>
          {pages.slice(0, 4).map((page, i) => (
            <motion.span
              key={page.url}
              initial={{ marginLeft: i ? 8 : 0, opacity: 0 }}
              animate={{ marginLeft: i ? (open ? -2 : -7) : 0, opacity: 1 }}
              // Each icon lifts on hover and settles back with a little spring.
              whileHover={{
                y: -4,
                scale: 1.05,
                transition: { duration: 0.32, ease: EASE },
              }}
              transition={{
                duration: 0.25,
                ease: EASE,
                delay: i * 0.04,
                y: { duration: 0.32, ease: [0.34, 3.85, 0.64, 1] },
                scale: { duration: 0.32, ease: [0.34, 3.85, 0.64, 1] },
              }}
              style={{ display: "flex", zIndex: 4 - i }}
            >
              <Favicon page={page} size={20} round />
            </motion.span>
          ))}
        </span>
        {words}
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
            <ol style={{ margin: 0, padding: "8px 0 0", listStyle: "none" }}>
              {pages.map((page, i) => (
                <motion.li
                  key={page.url}
                  initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{
                    duration: 0.5,
                    delay: Math.min(i, 7) * 0.04,
                    ease: EASE,
                  }}
                >
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "7px 8px",
                      borderRadius: 12,
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        fontSize: 12,
                        textAlign: "right",
                        opacity: 0.35,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {i + 1}
                    </span>
                    <Favicon page={page} size={18} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 13.5,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {page.title ?? siteName(page)}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          opacity: 0.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {displayUrl(page.url)}
                      </span>
                    </span>
                  </a>
                </motion.li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------------ */

/** The site's icon, or its first letter on a colour made from its name. */
function Favicon({
  page,
  size,
  round = false,
}: {
  page: TrailPage;
  size: number;
  round?: boolean;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const radius = round ? 9999 : "28%";
  if (page.icon && broken !== page.icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={page.icon}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(page.icon ?? null)}
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
  const host = hostOf(page.url);
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
        fontSize: size * 0.55,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {siteName(page).charAt(0).toUpperCase()}
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

/** The address without its scheme, as a browser shows it. */
function displayUrl(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

function siteName(page: TrailPage) {
  if (page.site) return page.site;
  const parts = hostOf(page.url).split(".");
  return parts.length > 1 ? parts[parts.length - 2] : parts[0];
}
