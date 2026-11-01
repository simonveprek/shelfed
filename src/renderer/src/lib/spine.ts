import type { Book, BookcasePrefs } from "../../../shared/types";
import { CLOTH } from "@/components/Colours";
import { hashString } from "./util";

// For covers that give no colour of their own.
const BRIGHT = ["#1d1b18", "#3d7bff", "#8c857c", "#c4372b", "#2f8f5b", "#5b4b8a", "#b5651d", "#2b4bff", "#a23bff"];
// Shades of the kit's ink, so they follow light and dark.
const INK = [92, 80, 68, 56, 44, 32];

const lightness = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** The spine's colour and the ink that reads on it, in the chosen style. */
export function spineOf(book: Book, style: BookcasePrefs["spines"]) {
  // A colour picked for this book wins over the style.
  if (book.spine) return { base: book.spine, ink: lightness(book.spine) > 0.6 ? "#1d1b18" : "#f6f5f1" };
  const hash = hashString(book.id);
  if (style === "ink") {
    const share = INK[hash % INK.length];
    return { base: `color-mix(in oklab, var(--foreground) ${share}%, var(--background))`, ink: share > 55 ? "var(--background)" : "var(--foreground)" };
  }
  const base = style === "cloth" ? CLOTH[hash % CLOTH.length] : (book.tint ?? BRIGHT[hash % BRIGHT.length]);
  return { base, ink: lightness(base) > 0.6 ? "#1d1b18" : "#f6f5f1" };
}
