// Fragms Personal kit, (c) 2026 Šimon Vepřek. Not MIT: only for use as part of Shelfed. See LICENSE-FRAGMS-PERSONAL.md.
/** Joins class names, skipping the ones that are off. */
export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(" ");

/** The one easing every Fragms UI motion shares, smooth out. */
export const EASE = [0.22, 1, 0.36, 1] as const;
