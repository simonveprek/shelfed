/**
 * The app icon in different finishes, to choose from in Settings. Always the
 * same mark, two plain spines and the one you are reading, leaning; what
 * changes is what it's made of and what it sits on.
 */
type Tile = { x: number; y: number; size: number };

export type AppIcon = {
  id: string;
  label: string;
  /** What the mark sits on, drawn inside the rounded tile. */
  ground: (tile: Tile) => string;
  /** The two plain spines, and the leaning one. Colours or paints from the shared defs. */
  spine: string;
  lean: string;
  /** How much light catches the spines' tops. */
  gloss: number;
  /** A thin rainbow edge on the spines, like foil. */
  rim?: boolean;
  /** Light around the mark. */
  glow?: string;
  /** How dark the mark's shadow is on the tile. */
  shadow: number;
  /** The tile's own edge, light on dark tiles. */
  edge: "light" | "dark";
};

export const AURORA_STOPS = ["#2b4bff", "#a23bff", "#ff2d55", "#ffb020"];

const at = (t: Tile, x: number, y: number) => [t.x + x * t.size, t.y + y * t.size] as const;
const blob = (t: Tile, x: number, y: number, r: number, color: string, opacity = 1, blur = "xl") => {
  const [cx, cy] = at(t, x, y);
  return `<circle cx="${cx}" cy="${cy}" r="${r * t.size}" fill="${color}" opacity="${opacity}" filter="url(#blur-${blur})"/>`;
};
const fill = (t: Tile, paint: string) => `<rect x="${t.x}" y="${t.y}" width="${t.size}" height="${t.size}" fill="${paint}"/>`;

/** Rays from the middle in pastel foil, for something like a conic gradient. */
const rays = (t: Tile, colors: string[]) => {
  const [cx, cy] = at(t, 0.5, 0.5);
  const reach = t.size;
  return colors
    .map((color, i) => {
      const a = (i / colors.length) * Math.PI * 2;
      const b = ((i + 1) / colors.length) * Math.PI * 2;
      const p = (angle: number) => `${cx + Math.cos(angle) * reach},${cy + Math.sin(angle) * reach}`;
      return `<polygon points="${cx},${cy} ${p(a)} ${p(b)}" fill="${color}"/>`;
    })
    .join("");
};

export const APP_ICONS: AppIcon[] = [
  {
    id: "paper",
    label: "Paper",
    ground: (t) => fill(t, "url(#paper)") + blob(t, 0.82, 0.85, 0.3, "#ff2d55", 0.08) + blob(t, 0.15, 0.1, 0.3, "#2b4bff", 0.05),
    spine: "#1d1b18",
    lean: "url(#aurora)",
    gloss: 0.32,
    shadow: 0.22,
    edge: "dark",
  },
  {
    id: "nebula",
    label: "Nebula",
    ground: (t) =>
      fill(t, "#14091f") +
      blob(t, 0.2, 1.0, 0.42, "#7a2bff", 0.9) +
      blob(t, 0.62, 1.05, 0.3, "#16d6c4", 0.75) +
      blob(t, 0.95, 0.75, 0.32, "#ff2d8a", 0.7) +
      blob(t, 0.1, 0.05, 0.3, "#d24bff", 0.45),
    spine: "#ffffff",
    lean: "#ffffff",
    gloss: 0.15,
    glow: "#ffffff",
    shadow: 0.35,
    edge: "light",
  },
  {
    id: "spectrum",
    label: "Spectrum",
    ground: (t) =>
      fill(t, "#ff3fa4") +
      blob(t, 0.0, 0.95, 0.5, "#1c3bff", 1) +
      blob(t, 0.05, 0.25, 0.32, "#2ad3ff", 0.9) +
      blob(t, 1.0, 0.15, 0.4, "#c13bff", 0.95) +
      blob(t, 0.95, 0.95, 0.42, "#ffb020", 1) +
      blob(t, 0.6, 0.65, 0.22, "#ff6a3d", 0.7),
    spine: "#fffdf8",
    lean: "#fffdf8",
    gloss: 0.1,
    glow: "#ffffff",
    shadow: 0.18,
    edge: "light",
  },
  {
    id: "foil",
    label: "Foil",
    ground: (t) =>
      fill(t, "#f4f4f8") +
      `<g opacity="0.9" filter="url(#blur-l)">${rays(t, ["#ffd1f0", "#c9f7ff", "#fff3b8", "#d9ccff", "#b8fff0", "#ffc9de", "#c9dcff", "#f1ffc4"])}</g>` +
      blob(t, 0.5, 0.5, 0.2, "#ffffff", 0.9, "l"),
    spine: "url(#jet)",
    lean: "url(#jet)",
    gloss: 0.45,
    shadow: 0.3,
    edge: "dark",
  },
  {
    id: "candy",
    label: "Candy",
    ground: (t) => fill(t, "url(#night)"),
    spine: "url(#candy)",
    lean: "url(#candy)",
    gloss: 0.35,
    glow: "#ff3fa4",
    shadow: 0.4,
    edge: "light",
  },
  {
    id: "lux",
    label: "Lux",
    ground: (t) => fill(t, "url(#night)") + blob(t, 0.5, -0.05, 0.4, "#ffffff", 0.08),
    spine: "url(#jet)",
    lean: "url(#jet)",
    gloss: 0.5,
    rim: true,
    shadow: 0.5,
    edge: "light",
  },
  {
    id: "zen",
    label: "Zen",
    ground: (t) => fill(t, "url(#zen)") + blob(t, 0.85, 0.9, 0.35, "#e6d3ff", 0.7) + blob(t, 0.1, 0.05, 0.3, "#ffe6cc", 0.8),
    spine: "url(#jet)",
    lean: "url(#jet)",
    gloss: 0.5,
    rim: true,
    shadow: 0.28,
    edge: "dark",
  },
  {
    id: "sky",
    label: "Sky",
    ground: (t) => {
      const puff = (x: number, y: number, r: number, o = 1) => blob(t, x, y, r, "#ffffff", o, "s");
      return (
        fill(t, "url(#sky)") +
        blob(t, 0.5, 0.95, 0.35, "#ffc2e4", 0.8) +
        puff(0.05, 0.92, 0.17) + puff(0.25, 0.97, 0.15) + puff(0.48, 0.9, 0.13, 0.95) + puff(0.72, 0.96, 0.17) + puff(0.95, 0.88, 0.16) +
        // A small cloud drifting by, top right.
        puff(0.8, 0.2, 0.055, 0.85) + puff(0.87, 0.17, 0.07, 0.85) + puff(0.94, 0.21, 0.055, 0.85) + puff(0.87, 0.23, 0.06, 0.85)
      );
    },
    spine: "url(#indigo)",
    lean: "url(#indigo)",
    gloss: 0.3,
    shadow: 0.2,
    edge: "light",
  },
];

export const appIcon = (id?: string) => APP_ICONS.find((icon) => icon.id === id) ?? APP_ICONS[0];

const stops = (colors: string[]) => colors.map((c, i) => `<stop offset="${colors.length > 1 ? i / (colors.length - 1) : 0}" stop-color="${c}"/>`).join("");

/**
 * The icon as SVG, 1024 square. On macOS the tile sits on Apple's icon grid
 * with room for its shadow; elsewhere it fills the square, as Windows expects.
 */
export function appIconSvg(icon: AppIcon, mac = true) {
  const [x, size, round] = mac ? [100, 824, 186] : [0, 1024, 224];
  const tile = { x, y: x, size };
  // The mark on its 32 grid, in the middle.
  const s = mac ? 16.5 : 20.5;
  const o = 512 - 16 * s;
  const spine = (sx: number, sy: number, h: number) => ({ x: o + sx * s, y: o + sy * s, w: 7 * s, h: h * s, r: 3 * s });
  const lean = spine(23.7, 10, 19);
  const marks = [
    { box: spine(2.5, 3, 26), paint: icon.spine, tilt: "" },
    { box: spine(11.5, 8, 21), paint: icon.spine, tilt: "" },
    { box: lean, paint: icon.lean, tilt: `transform="rotate(-16 ${lean.x} ${lean.y + lean.h})"` },
  ];
  const rect = (b: { x: number; y: number; w: number; h: number; r: number }, attrs: string) =>
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" ${attrs}/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="aurora" x1="0" y1="0" x2="1" y2="1">${stops(AURORA_STOPS)}</linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">${stops(["#ffffff", "#f1efea"])}</linearGradient>
    <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">${stops(["#232226", "#0b0b0d"])}</linearGradient>
    <linearGradient id="zen" x1="0" y1="0" x2="1" y2="1">${stops(["#fff6ea", "#fbe9e4", "#efe4fb"])}</linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${stops(["#3d5ce6", "#7f8ff5", "#d9c6f5", "#ffe3f1"])}</linearGradient>
    <linearGradient id="jet" x1="0" y1="0" x2="0" y2="1">${stops(["#3a3a40", "#0d0d10"])}</linearGradient>
    <linearGradient id="indigo" x1="0" y1="0" x2="1" y2="1">${stops(["#5b4bff", "#2a1fb8", "#3a2a9e"])}</linearGradient>
    <linearGradient id="rainbow" x1="0" y1="0" x2="1" y2="1">${stops(["#7cf3ff", "#a98bff", "#ff7ad9", "#ffd36b", "#8dffc0", "#7cb8ff"])}</linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.38" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/>
    </linearGradient>
    <pattern id="candy" patternUnits="userSpaceOnUse" width="${s * 4.2}" height="${s * 4.2}" patternTransform="rotate(-35)">
      <rect width="${s * 4.2}" height="${s * 4.2}" fill="#ff2d8a"/>
      <rect width="${s * 4.2}" height="${s * 1.4}" fill="#ff8a3d"/>
      <rect y="${s * 2.1}" width="${s * 4.2}" height="${s * 0.9}" fill="#ffb3d9"/>
    </pattern>
    <radialGradient id="sheen" cx="0.5" cy="0" r="0.8">
      <stop offset="0" stop-color="#fff" stop-opacity="${icon.edge === "light" ? 0.12 : 0.5}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="clip"><rect x="${x}" y="${x}" width="${size}" height="${size}" rx="${round}"/></clipPath>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000" flood-opacity="${mac ? 0.28 : 0}"/>
    </filter>
    <filter id="blur-s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${size * 0.012}"/></filter>
    <filter id="blur-l" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${size * 0.05}"/></filter>
    <filter id="blur-xl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${size * 0.11}"/></filter>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s * 0.9}"/></filter>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="${s * 2.4}"/></filter>
  </defs>
  <rect x="${x}" y="${x}" width="${size}" height="${size}" rx="${round}" fill="#000" filter="url(#drop)"/>
  <g clip-path="url(#clip)">
    ${icon.ground(tile)}
    <ellipse cx="512" cy="${x}" rx="${size * 0.7}" ry="${size * 0.4}" fill="url(#sheen)"/>
    ${icon.glow ? marks.map((m) => rect(m.box, `fill="${icon.glow}" opacity="0.4" filter="url(#glow)" ${m.tilt}`)).join("") : ""}
    ${marks.map((m) => rect({ ...m.box, y: m.box.y + s * 1.1 }, `fill="#000" opacity="${icon.shadow}" filter="url(#shadow)" ${m.tilt}`)).join("")}
    ${marks
      .map(
        (m) => `<g ${m.tilt}>
      ${rect(m.box, `fill="${m.paint}"`)}
      ${rect(m.box, `fill="url(#side)"`)}
      ${rect({ x: m.box.x + s * 0.9, y: m.box.y + s * 0.7, w: m.box.w - s * 1.8, h: m.box.h * 0.5, r: m.box.r - s * 0.9 }, `fill="url(#gloss)" opacity="${icon.gloss}"`)}
      ${icon.rim ? rect({ x: m.box.x + s * 0.2, y: m.box.y + s * 0.2, w: m.box.w - s * 0.4, h: m.box.h - s * 0.4, r: m.box.r - s * 0.2 }, `fill="none" stroke="url(#rainbow)" stroke-width="${s * 0.26}"`) : ""}
    </g>`,
      )
      .join("")}
  </g>
  <rect x="${x + 1}" y="${x + 1}" width="${size - 2}" height="${size - 2}" rx="${round - 1}" fill="none" stroke="${icon.edge === "light" ? "#fff" : "#000"}" stroke-opacity="${icon.edge === "light" ? 0.14 : 0.08}" stroke-width="2"/>
</svg>`;
}
