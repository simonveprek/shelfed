/*
 * A whole theme as data. Every colour the kit reads, for light and dark,
 * plus the brand accent, the four glow colours and how round corners are.
 * themeCss turns one into the CSS the starter injects, and fromBrand makes
 * a full theme out of a single colour. No React, so the server reads it.
 *
 * Make one at the Fragms Personal site under Theme, then paste it into
 * theme in src/app.config.ts.
 */

export const TOKENS = [
  "background",
  "foreground",
  "muted",
  "card",
  "cardHover",
  "well",
  "tile",
  "pill",
  "control",
  "controlHover",
  "controlActive",
  "border",
  "lineStrong",
  "underline",
  "primary",
  "primaryInk",
  "accent",
  "danger",
  "success",
  "stage",
  "stageInk",
  "shadow",
] as const;

export type TokenName = (typeof TOKENS)[number];
export type Tokens = Record<TokenName, string>;
export type Glow = [string, string, string, string];

export type AppTheme = {
  accent: string;
  glow: Glow;
  /** 1 is Fragms. 0.5 is sharper, 1.5 rounder. */
  radius: number;
  light: Tokens;
  dark: Tokens;
};

/** The Fragms look, exactly as globals.css has it. */
export const FRAGMS: AppTheme = {
  accent: "#3d7bff",
  glow: ["#2b4bff", "#a23bff", "#ff2d55", "#ffb020"],
  radius: 1,
  light: {
    background: "#f6f5f1",
    foreground: "#1d1b18",
    muted: "#77716a",
    card: "#fdfcfa",
    cardHover: "#f9f8f4",
    well: "#f3f1ec",
    tile: "#efede8",
    pill: "#ebe9e3",
    control: "#edebe6",
    controlHover: "#e6e3dd",
    controlActive: "#dfdcd5",
    border: "#2e241414",
    lineStrong: "#2e24141f",
    underline: "#2e241433",
    primary: "#1d1b18",
    primaryInk: "#f6f5f1",
    accent: "#3d7bff",
    danger: "#c4372b",
    success: "#2f8f5b",
    stage: "#fdfcfa",
    stageInk: "#1d1b18",
    shadow: "#3c2c16",
  },
  dark: {
    background: "#111111",
    foreground: "#ededed",
    muted: "#8f8f8f",
    card: "#181818",
    cardHover: "#1c1c1c",
    well: "#141414",
    tile: "#222222",
    pill: "#232323",
    control: "#212121",
    controlHover: "#282828",
    controlActive: "#2f2f2f",
    border: "#ffffff0f",
    lineStrong: "#ffffff1a",
    underline: "#ffffff38",
    primary: "#ededed",
    primaryInk: "#111111",
    accent: "#6b9bff",
    danger: "#f0695c",
    success: "#5fc48c",
    stage: "#070707",
    stageInk: "#ffffff",
    shadow: "#000000",
  },
};

/* ------------------------------------------------------------------ */
/* Colour maths. OKLCH, so a lighter or more colourful step looks even. */
/* ------------------------------------------------------------------ */

type Rgb = [number, number, number];
export type Oklch = { l: number; c: number; h: number };

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function parseHex(hex: string): { rgb: Rgb; alpha: number } | null {
  const value = hex.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return null;
  const full = value.length <= 4 ? value.replace(/./g, "$&$&") : value;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { rgb: [n(0) / 255, n(2) / 255, n(4) / 255], alpha: full.length === 8 ? n(6) / 255 : 1 };
}

const byte = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0");

export const toHex = ([r, g, b]: Rgb, alpha = 1) => `#${byte(r)}${byte(g)}${byte(b)}${alpha < 1 ? byte(alpha) : ""}`;

function rgbToOklch([r, g, b]: Rgb): Oklch {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

function oklchToLinear({ l: L, c, h }: Oklch): Rgb {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** An OKLCH colour as hex, with chroma pulled in until the screen can show it. */
export function oklch(color: Oklch, alpha = 1) {
  let { c } = color;
  let linear = oklchToLinear({ ...color, c });
  if (!inGamut(linear)) {
    let low = 0;
    let high = c;
    for (let i = 0; i < 20; i++) {
      c = (low + high) / 2;
      if (inGamut(oklchToLinear({ ...color, c }))) low = c;
      else high = c;
    }
    c = low;
    linear = oklchToLinear({ ...color, c });
  }
  return toHex(linear.map(toGamma) as Rgb, alpha);
}

export function toOklch(hex: string): Oklch {
  return rgbToOklch(parseHex(hex)?.rgb ?? [0, 0, 0]);
}

/** WCAG contrast between two colours, from 1 to 21. Transparent ones sit on over. */
export function contrast(a: string, b: string, over = "#ffffff") {
  const flat = (hex: string) => {
    const parsed = parseHex(hex);
    if (!parsed) return [0, 0, 0] as Rgb;
    if (parsed.alpha === 1) return parsed.rgb;
    const base = parseHex(over)?.rgb ?? [1, 1, 1];
    return parsed.rgb.map((v, i) => v * parsed.alpha + base[i] * (1 - parsed.alpha)) as Rgb;
  };
  const luminance = (rgb: Rgb) => {
    const [r, g, bl] = rgb.map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luminance(flat(a)), luminance(flat(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Moves a text colour lighter or darker, keeping its hue, until it reads on the background. */
export function fixContrast(text: string, background: string, target = 4.5) {
  if (contrast(text, background) >= target) return text;
  const start = toOklch(text);
  const darker = toOklch(background).l > 0.5;
  for (let step = 1; step <= 60; step++) {
    const l = Math.min(1, Math.max(0, start.l + (darker ? -1 : 1) * step * 0.01));
    const next = oklch({ ...start, l });
    if (contrast(next, background) >= target) return next;
  }
  return darker ? "#000000" : "#ffffff";
}

/* ------------------------------------------------------------------ */
/* One colour to a whole theme.                                        */
/* ------------------------------------------------------------------ */

export type Recipe = {
  brand: string;
  /** How much of the brand colour runs into the greys, from 0 to 1. */
  tint: number;
  /** Main buttons in the ink colour, or in the brand colour. */
  primary: "ink" | "brand";
  /** How far the quiet text sits from the main text. */
  contrast: "soft" | "standard" | "high";
  radius: number;
};

// Lightness of each surface, taken from the Fragms defaults so a generated
// theme keeps the same rhythm of card, well and control.
const SURFACES: TokenName[] = [
  "background",
  "foreground",
  "muted",
  "card",
  "cardHover",
  "well",
  "tile",
  "pill",
  "control",
  "controlHover",
  "controlActive",
  "stage",
  "stageInk",
];

const lightness = (mode: "light" | "dark") =>
  Object.fromEntries(SURFACES.map((name) => [name, toOklch(FRAGMS[mode][name]).l])) as Record<TokenName, number>;

const LIGHT = lightness("light");
const DARK = lightness("dark");

/** A readable colour on top of another, white or near black. */
function inkOn(color: string, light: string, dark: string) {
  return contrast(light, color) >= contrast(dark, color) ? light : dark;
}

function mode(recipe: Recipe, which: "light" | "dark"): Tokens {
  const brand = toOklch(recipe.brand);
  const h = brand.h;
  const L = which === "light" ? LIGHT : DARK;
  const dark = which === "dark";
  // Greys pick up the brand's hue, up to a chroma that still reads as grey.
  const chroma = recipe.tint * (dark ? 0.014 : 0.016);
  const surface = (name: TokenName, extra = 1) => oklch({ l: L[name], c: chroma * extra, h });

  const shift = { soft: dark ? -0.06 : 0.06, standard: 0, high: dark ? 0.1 : -0.12 }[recipe.contrast];
  const foreground = oklch({ l: L.foreground, c: chroma * 0.8, h });
  const muted = oklch({ l: L.muted + shift, c: chroma * 1.4, h });
  const background = surface("background");

  // Lines are the ink at low strength, so they sit on any surface.
  const line = dark ? oklch({ l: 1, c: chroma * 0.5, h }) : oklch({ l: 0.27, c: chroma * 2.2 + 0.012, h });
  const lineRgb = parseHex(line)?.rgb ?? [0, 0, 0];
  const [border, lineStrong, underline] = (dark ? [0.06, 0.1, 0.22] : [0.08, 0.12, 0.2]).map((a) => toHex(lineRgb, a));

  // The brand, lifted in dark so it still reads as text and as a fill.
  const accent = oklch({ l: dark ? Math.max(brand.l, 0.72) : Math.min(brand.l, 0.62), c: brand.c, h });
  const fill =
    recipe.primary === "ink" ? foreground : oklch({ l: dark ? Math.max(brand.l, 0.68) : Math.min(brand.l, 0.58), c: brand.c, h });
  const primaryInk = recipe.primary === "ink" ? background : inkOn(fill, "#ffffff", oklch({ l: 0.18, c: chroma, h }));
  // A brand fill moves just far enough from its text to read.
  const primaryFill = fixContrast(fill, primaryInk, 4.5);

  return {
    background,
    foreground,
    // Quiet text has to read on cards and inside fields alike.
    muted: [surface("well"), surface("card")].reduce(
      (text, under) => fixContrast(text, under, recipe.contrast === "soft" ? 3.6 : 4.5),
      muted,
    ),
    card: surface("card"),
    cardHover: surface("cardHover"),
    well: surface("well"),
    tile: surface("tile"),
    pill: surface("pill", 1.2),
    control: surface("control", 1.2),
    controlHover: surface("controlHover", 1.3),
    controlActive: surface("controlActive", 1.4),
    border,
    lineStrong,
    underline,
    primary: primaryFill,
    primaryInk,
    accent,
    danger: FRAGMS[which].danger,
    success: FRAGMS[which].success,
    stage: surface("stage"),
    stageInk: oklch({ l: L.stageInk, c: chroma * 0.5, h }),
    shadow: dark ? "#000000" : oklch({ l: 0.3, c: chroma * 2 + 0.02, h }),
  };
}

/** Four colours around the brand, for Aura and anything else that glows. */
export function glowFor(brand: string): Glow {
  const { h } = toOklch(brand);
  return [-40, -12, 18, 48].map((turn) => oklch({ l: 0.68, c: 0.19, h: (h + turn + 360) % 360 })) as Glow;
}

export function fromBrand(recipe: Recipe): AppTheme {
  return {
    accent: recipe.brand,
    glow: glowFor(recipe.brand),
    radius: recipe.radius,
    light: mode(recipe, "light"),
    dark: mode(recipe, "dark"),
  };
}

/* ------------------------------------------------------------------ */
/* To CSS.                                                             */
/* ------------------------------------------------------------------ */

const CSS_NAMES: Record<Exclude<TokenName, "shadow">, string> = {
  background: "--background",
  foreground: "--foreground",
  muted: "--muted",
  card: "--card",
  cardHover: "--card-hover",
  well: "--well",
  tile: "--tile",
  pill: "--pill",
  control: "--control",
  controlHover: "--control-hover",
  controlActive: "--control-active",
  border: "--border",
  lineStrong: "--line-strong",
  underline: "--underline",
  primary: "--primary",
  primaryInk: "--primary-ink",
  accent: "--accent",
  danger: "--danger",
  success: "--success",
  stage: "--stage",
  stageInk: "--stage-ink",
};

const RADII: [string, number][] = [
  ["--r-card", 28],
  ["--r-panel", 24],
  ["--r-stage", 20],
  ["--r-field", 14],
  ["--r-item", 12],
];

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = (parseHex(hex)?.rgb ?? [0, 0, 0]).map((v) => Math.round(v * 255));
  return `rgb(${r} ${g} ${b} / ${alpha})`;
};

/** The declarations for one mode, without a selector, so a preview can scope them. */
export function tokenDeclarations(tokens: Tokens, which: "light" | "dark", radius = 1) {
  const lines = Object.entries(CSS_NAMES).map(([key, name]) => `${name}: ${tokens[key as TokenName]};`);
  if (which === "light") {
    lines.push(
      `--shadow-float: 0 22px 50px -20px ${rgba(tokens.shadow, 0.22)};`,
      `--shadow-card: 0 1px 2px ${rgba(tokens.shadow, 0.04)}, 0 10px 28px -18px ${rgba(tokens.shadow, 0.14)};`,
    );
  } else {
    lines.push(`--shadow-float: 0 22px 50px -18px ${rgba(tokens.shadow, 0.75)};`, "--shadow-card: none;");
  }
  lines.push(...RADII.map(([name, px]) => `${name}: ${Math.round(px * radius * 10) / 10}px;`));
  return lines.join(" ");
}

/** The CSS the starter puts in the page when app.config has a theme. */
export function themeCss(theme: AppTheme) {
  return `:root { ${tokenDeclarations(theme.light, "light", theme.radius)} }\n.dark { ${tokenDeclarations(theme.dark, "dark", theme.radius)} }`;
}

/** The theme as code to paste into src/app.config.ts. */
export function themeSource(theme: AppTheme) {
  const block = (tokens: Tokens) =>
    `{\n${TOKENS.map((name) => `    ${name}: "${tokens[name]}",`).join("\n")}\n  }`;
  return `export const theme: AppTheme | null = {
  accent: "${theme.accent}",
  glow: [${theme.glow.map((color) => `"${color}"`).join(", ")}],
  radius: ${theme.radius},
  light: ${block(theme.light)},
  dark: ${block(theme.dark)},
};`;
}
