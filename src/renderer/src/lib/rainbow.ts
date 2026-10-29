/* Spines in rainbow order, for a bookcase that runs through the spectrum. */

/** A colour's hue, saturation and lightness, from #rrggbb. */
function hsl(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/**
 * Where a book stands in a rainbow: by its spine's hue, red round to violet,
 * the greys and near-blacks after, light to dark. Spines in ink go light to dark.
 */
export function rainbowKey(base: string) {
  if (!/^#[0-9a-f]{6}$/i.test(base)) {
    const share = Number(base.match(/(\d+)%/)?.[1] ?? 50);
    return 1000 + share;
  }
  const { h, s, l } = hsl(base);
  if (s < 0.18 || l < 0.12 || l > 0.92) return 1000 + (1 - l) * 100;
  return h + l * 0.5;
}
