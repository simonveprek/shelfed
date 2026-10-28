/*
 * The lists behind Point, in a plain module so server code can read them.
 * A "use client" file only hands the server references, so checking a
 * stored shape against POINT_SHAPES there would never match.
 */

export const POINT_SHAPES = [
  "circle",
  "pebble",
  "squircle",
  "cookie",
  "clover",
  "flower",
  "sunny",
  "gumdrop",
  "star",
  "heart",
] as const;

export const POINT_MOODS = [
  "idle",
  "listening",
  "thinking",
  "talking",
  "happy",
  "surprised",
  "sleepy",
  "sad",
  "reading",
  "curious",
  "excited",
  "wink",
  "love",
  "confused",
  "angry",
  "dizzy",
] as const;

/** Flat tones that sit well next to each other. Ink follows the text colour. */
export const POINT_COLORS = {
  ink: "currentColor",
  orange: "#ff6a3d",
  yellow: "#ffbe1a",
  green: "#22b573",
  teal: "#12b5b0",
  blue: "#3d7bff",
  violet: "#8b5cf6",
  pink: "#ff5fa2",
  red: "#f0433a",
} as const;

export type PointShape = (typeof POINT_SHAPES)[number];
export type PointMood = (typeof POINT_MOODS)[number];
