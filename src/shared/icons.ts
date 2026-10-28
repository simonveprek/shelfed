/**
 * The app icon in different finishes, to choose from in Settings. The same
 * mark, two plain spines and the one you are reading, made of glass over a
 * glowing tile.
 */
type Glow = { x: number; y: number; r: number; color: string; opacity: number };

export type AppIcon = {
  id: string;
  label: string;
  /** The tile, top left to bottom right. */
  tile: [string, string];
  /** Light pooling under the glass. */
  glows: Glow[];
  /** Frosted white glass, or smoked dark glass on a light tile. */
  glass: "light" | "dark";
  /** The leaning spine's colours. */
  lean: string[];
};

export const AURORA_STOPS = ["#2b4bff", "#a23bff", "#ff2d55", "#ffb020"];

export const APP_ICONS: AppIcon[] = [
  {
    id: "paper",
    label: "Paper",
    tile: ["#fdfcfa", "#e9e5dc"],
    glows: [
      { x: 0.8, y: 0.8, r: 0.38, color: "#ff2d55", opacity: 0.2 },
      { x: 0.2, y: 0.18, r: 0.34, color: "#2b4bff", opacity: 0.12 },
    ],
    glass: "dark",
    lean: AURORA_STOPS,
  },
  {
    id: "midnight",
    label: "Midnight",
    tile: ["#1d2142", "#05060c"],
    glows: [
      { x: 0.78, y: 0.76, r: 0.42, color: "#a23bff", opacity: 0.6 },
      { x: 0.18, y: 0.22, r: 0.36, color: "#2b4bff", opacity: 0.5 },
      { x: 0.9, y: 0.3, r: 0.24, color: "#ff2d55", opacity: 0.32 },
    ],
    glass: "light",
    lean: AURORA_STOPS,
  },
  {
    id: "aurora",
    label: "Aurora",
    tile: ["#4a3dff", "#ff3d6e"],
    glows: [
      { x: 0.85, y: 0.9, r: 0.45, color: "#ffb020", opacity: 0.75 },
      { x: 0.12, y: 0.12, r: 0.4, color: "#2b6bff", opacity: 0.6 },
      { x: 0.5, y: 0.45, r: 0.3, color: "#c13bff", opacity: 0.35 },
    ],
    glass: "light",
    lean: ["#ffffff", "#fff4fb", "#ffe9d6"],
  },
  {
    id: "amber",
    label: "Amber",
    tile: ["#8c4a18", "#240f05"],
    glows: [
      { x: 0.74, y: 0.78, r: 0.46, color: "#ffb020", opacity: 0.6 },
      { x: 0.18, y: 0.18, r: 0.32, color: "#ff6a2d", opacity: 0.32 },
    ],
    glass: "light",
    lean: ["#fff0b8", "#ffc23d", "#ff7a1a"],
  },
  {
    id: "ocean",
    label: "Ocean",
    tile: ["#0d5f73", "#04142a"],
    glows: [
      { x: 0.76, y: 0.72, r: 0.46, color: "#2de0ff", opacity: 0.5 },
      { x: 0.16, y: 0.22, r: 0.36, color: "#2b4bff", opacity: 0.45 },
    ],
    glass: "light",
    lean: ["#9af6ff", "#2bb4ff", "#5b4bff"],
  },
  {
    id: "rose",
    label: "Rose",
    tile: ["#7d1733", "#22050d"],
    glows: [
      { x: 0.76, y: 0.78, r: 0.46, color: "#ff2d55", opacity: 0.55 },
      { x: 0.2, y: 0.18, r: 0.3, color: "#ffb020", opacity: 0.26 },
    ],
    glass: "light",
    lean: ["#ffe7b0", "#ffb020", "#ff5a3d"],
  },
];

export const appIcon = (id?: string) => APP_ICONS.find((icon) => icon.id === id) ?? APP_ICONS[0];

const stops = (colors: string[]) => colors.map((c, i) => `<stop offset="${colors.length > 1 ? i / (colors.length - 1) : 0}" stop-color="${c}"/>`).join("");

/**
 * The icon as SVG, 1024 square. On macOS the tile sits on Apple's icon grid
 * with room for its shadow; elsewhere it fills the square, as Windows expects.
 */
export function appIconSvg(icon: AppIcon, mac = true) {
  const [t, size, round] = mac ? [100, 824, 186] : [0, 1024, 224];
  // The mark on its 32 grid, placed in the middle.
  const s = mac ? 15 : 18.6;
  const o = 512 - 16 * s;
  const spine = (x: number, y: number, h: number) => ({ x: o + x * s, y: o + y * s, w: 7 * s, h: h * s, r: 3 * s });
  const plain = [spine(2.5, 3, 26), spine(11.5, 8, 21)];
  const lean = spine(23.7, 10, 19);
  const tilt = `rotate(-16 ${lean.x} ${lean.y + lean.h})`;
  const dark = icon.glass === "dark";

  const rect = (b: { x: number; y: number; w: number; h: number; r: number }, attrs: string) =>
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" ${attrs}/>`;

  /** One spine of glass: its shadow, body, rim and the light caught on its edge. */
  const glass = (b: ReturnType<typeof spine>, body: string, extra = "") => {
    const shine = { x: b.x + b.w * 0.2, y: b.y + b.w * 0.22, w: b.w * 0.2, h: b.h * 0.5, r: b.w * 0.1 };
    return `<g ${extra}>
      ${rect({ ...b, y: b.y + s * 0.9 }, `fill="#000" opacity="${dark ? 0.18 : 0.32}" filter="url(#soft)"`)}
      ${rect(b, `fill="${body}"`)}
      ${rect(b, `fill="url(#depth)"`)}
      ${rect({ x: b.x + 1.5, y: b.y + 1.5, w: b.w - 3, h: b.h - 3, r: b.r - 1.5 }, `fill="none" stroke="url(#rim)" stroke-width="${s * 0.22}"`)}
      ${rect(shine, `fill="url(#shine)" filter="url(#hair)"`)}
    </g>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">${stops(icon.tile)}</linearGradient>
    <linearGradient id="lean" x1="0" y1="0" x2="1" y2="1">${stops(icon.lean)}</linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      ${dark ? `<stop offset="0" stop-color="#2a2622" stop-opacity="0.94"/><stop offset="1" stop-color="#121010" stop-opacity="0.86"/>` : `<stop offset="0" stop-color="#fff" stop-opacity="0.44"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#fff" stop-opacity="0.24"/>`}
    </linearGradient>
    <linearGradient id="depth" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.55 : 0.95}"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.12"/><stop offset="1" stop-color="#fff" stop-opacity="${dark ? 0.2 : 0.45}"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="sheen" cx="0.5" cy="0" r="0.75">
      <stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.7 : 0.26}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.9 : 0.42}"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="${dark ? 0.3 : 0.14}"/>
    </linearGradient>
    <clipPath id="clip"><rect x="${t}" y="${t}" width="${size}" height="${size}" rx="${round}"/></clipPath>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#1a1208" flood-opacity="${mac ? 0.3 : 0}"/>
    </filter>
    <filter id="haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${size * 0.09}"/></filter>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${s * 2.2}"/></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s * 0.7}"/></filter>
    <filter id="hair" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s * 0.12}"/></filter>
  </defs>
  <rect x="${t}" y="${t}" width="${size}" height="${size}" rx="${round}" fill="url(#tile)" filter="url(#drop)"/>
  <g clip-path="url(#clip)">
    ${icon.glows.map((g) => `<circle cx="${t + g.x * size}" cy="${t + g.y * size}" r="${g.r * size}" fill="${g.color}" opacity="${g.opacity}" filter="url(#haze)"/>`).join("")}
    <!-- The reading spine lights the tile around it. -->
    ${rect(lean, `fill="url(#lean)" opacity="${dark ? 0.45 : 0.75}" filter="url(#glow)" transform="${tilt}"`)}
    <ellipse cx="512" cy="${t}" rx="${size * 0.62}" ry="${size * 0.42}" fill="url(#sheen)"/>
    ${plain.map((b) => glass(b, "url(#body)")).join("")}
    ${glass(lean, "url(#lean)", `transform="${tilt}"`)}
  </g>
  <rect x="${t + 1.5}" y="${t + 1.5}" width="${size - 3}" height="${size - 3}" rx="${round - 1.5}" fill="none" stroke="url(#edge)" stroke-width="3"/>
</svg>`;
}
