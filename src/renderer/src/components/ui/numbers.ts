/*
 * Named ways to write a number. A server page can't hand a function to a
 * client component, so charts and sliders take one of these names, with a
 * prefix or a suffix around it, and still take a function from client code.
 *
 *   <BarChart format="compact" suffix=" XP" ... />   18.2K XP
 *   <Slider format="number" prefix="€" ... />        €1,250
 */

export type NumberFormat = "compact" | "number" | "bytes" | ((value: number) => string);

export type NumberAffixes = {
  /** Goes before the number, like a currency sign. */
  prefix?: string;
  /** Goes after the number. Start it with a space for a word, like " XP". */
  suffix?: string;
};

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

function bytes(value: number) {
  const size = Math.abs(value);
  if (size < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const power = Math.min(units.length, Math.floor(Math.log(size) / Math.log(1024)));
  return `${plain.format(Number((value / 1024 ** power).toFixed(1)))} ${units[power - 1]}`;
}

const WRITERS = {
  compact: (value: number) => compact.format(value),
  number: (value: number) => plain.format(value),
  bytes,
};

export function formatNumber(value: number, format: NumberFormat = "compact", { prefix = "", suffix = "" }: NumberAffixes = {}) {
  const text = typeof format === "function" ? format(value) : WRITERS[format](value);
  // The sign leads, so a loss reads -€40 and not €-40.
  const negative = prefix && text.startsWith("-");
  return negative ? `-${prefix}${text.slice(1)}${suffix}` : `${prefix}${text}${suffix}`;
}
