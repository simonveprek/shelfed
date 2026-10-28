const SUFFIX = /^(jr|sr|ii|iii|iv|v|phd|md|esq)\.?$/i;
const COMPANY = /\b(inc|ltd|llc|co|corp|plc|gmbh|press|books|publishing|publishers)\.?$/i;

/**
 * A person's name the way it's written on a spine, first name first.
 * Catalogues and many EPUBs give "Flanagan, John", sometimes with life
 * dates after: "Doyle, Arthur Conan, 1859-1930". Anything that isn't clearly
 * a name turned round, like "Penguin, Inc.", is left as it is.
 */
export function personName(raw: string) {
  const name = raw
    .trim()
    // Life dates on the end: ", 1859-1930", " (1775-1817)", ", 1944-".
    .replace(/,?\s*\(?\s*\d{3,4}\??\s*[-–]\s*(\d{3,4}\??)?\s*\)?$/, "")
    .trim();
  const parts = name.split(/\s*,\s*/);
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !p)) return name;
  const [last, first, suffix] = parts;
  if (SUFFIX.test(first) || COMPANY.test(first)) return name;
  if (suffix && !SUFFIX.test(suffix)) return name;
  return [first, last, suffix].filter(Boolean).join(" ");
}

/** Every author turned round, without the ones that come out the same twice. */
export const personNames = (names: string[]) => [...new Set(names.map(personName).filter(Boolean))];
