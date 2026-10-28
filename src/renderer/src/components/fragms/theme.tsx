"use client";

/**
 * Fragms Theme. One place to give every Fragms component the same look.
 * Wrap your app, or any part of it, and each component inside takes its
 * colours, corners and pace from here. A prop on a component still wins.
 *
 *   <FragmsTheme theme={{ accent: "#ff6a3d", glow: [...], roundness: 1.4 }}>
 *     <App />
 *   </FragmsTheme>
 *
 * Without a theme, every component looks exactly as it always has.
 *
 * Fragms 2.1.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

import { createContext, useContext, type ReactNode } from "react";

export type Theme = {
  /** The colour of the agent. Send buttons, cursors, rings and faces. */
  accent?: string;
  /** Four colours for anything that glows, like Aura and a listening Composer. */
  glow?: [string, string, string, string];
  /** How round the corners are. 0 is square, 1 the usual, 2 very round. */
  roundness?: number;
  /** How quick the motion is. 1 is the usual, below is calmer, above livelier. */
  pace?: number;
  /** A CSS font family for every component's words. Left out, the page's own. */
  font?: string;
};

const Context = createContext<Theme>({});

export function FragmsTheme({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  // A theme inside another fills in only what it changes.
  const outer = useContext(Context);
  return (
    <Context.Provider value={{ ...outer, ...theme }}>
      {theme.font ? (
        // Takes no room of its own, it only hands its font down.
        <div style={{ display: "contents", fontFamily: theme.font }}>
          {children}
        </div>
      ) : (
        children
      )}
    </Context.Provider>
  );
}

/** The theme around a component, or an empty one. */
export function useTheme(): Theme {
  return useContext(Context);
}

/** A corner radius scaled by the theme's roundness. */
export function rounded(radius: number, theme: Theme) {
  return Math.round(radius * (theme.roundness ?? 1));
}

/**
 * True for a light colour, however the browser writes it. A computed colour
 * can come back as rgb(), as color(srgb ...) or, once it has transparency
 * mixed in, as oklab(), so each is read for what it is.
 */
export function isLightColor(color: string) {
  const inner = color
    .slice(color.indexOf("(") + 1)
    .replace(/^[a-z][\w-]*\s+/i, "");
  const n = (inner.match(/-?[\d.]+/g) ?? []).map(Number);
  if (n.length < 3 || n.some(Number.isNaN)) return false;
  // Lightness first, from 0 to 1 in oklab and oklch, and 0 to 100 in lab.
  if (/^(ok)?l(ab|ch)\(/i.test(color))
    return (n[0] > 1 || color.includes("%") ? n[0] / 100 : n[0]) > 0.6;
  const scale = color.startsWith("color(") ? 1 : 255;
  return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / scale > 0.55;
}
