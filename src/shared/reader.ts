import type { ReaderPrefs } from "./types";

/**
 * Saved reader settings, as they're used now. Every page used to start out
 * light, and nothing says who chose that, so light only counts once it has
 * been picked. Anyone else's page follows the app.
 */
export function savedReader<T extends Partial<ReaderPrefs>>(saved: T): T {
  return saved.theme === "light" && !saved.picked ? { ...saved, theme: "auto" } : saved;
}
