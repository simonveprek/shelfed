/*
 * Shelfed in more than one language. The English text is the key: t("Add
 * books") gives "Add books" in English and "Přidat knihy" in Czech, so the
 * code reads as it always has, and a text with no translation yet simply stays
 * English. Translations live in src/shared/locales, one file per part of the app.
 *
 * Numbers that count something take tn(), with the English for one and for
 * many. Czech has three forms (1 kniha, 2 knihy, 5 knih), written in its
 * dictionary as "{n} kniha|{n} knihy|{n} knih".
 */

export type Language = "en" | "cs";
export const LANGUAGES: Array<{ id: Language; name: string }> = [
  { id: "en", name: "English" },
  { id: "cs", name: "Čeština" },
];

type Words = Record<string, string>;
const dictionaries: Record<Language, Words> = { en: {}, cs: {} };
let current: Language = "en";

/** The language a system asks for, from its locale: Czech for cs-CZ, English for anything else. */
export const fromLocale = (locale: string | undefined): Language => (/^cs\b/i.test(locale ?? "") ? "cs" : "en");

export function setLanguage(language: Language) {
  current = language;
}

export const language = () => current;

/** Adds translations, from one of the files in src/shared/locales. */
export function addWords(language: Language, words: Words) {
  Object.assign(dictionaries[language], words);
}

const fill = (text: string, values?: Record<string, string | number>) =>
  values ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in values ? format(values[name]) : all)) : text;

const format = (value: string | number) => (typeof value === "number" ? value.toLocaleString(current === "cs" ? "cs-CZ" : "en-US") : value);

/** A text in the chosen language, with {name} filled in from values. */
export function t(text: string, values?: Record<string, string | number>): string {
  return fill(current === "en" ? text : (dictionaries[current][text] ?? text), values);
}

/**
 * A word that means something different in different places: "Reading" is a
 * place in the sidebar (Rozečtené), a book's state (Čtu) and a section of
 * Settings (Čtení). The dictionary can hold "Reading@status"; without one, it
 * falls back to the plain translation.
 */
export function tc(context: string, text: string, values?: Record<string, string | number>): string {
  if (current === "en") return fill(text, values);
  return fill(dictionaries[current][`${text}@${context}`] ?? dictionaries[current][text] ?? text, values);
}

/** Which Czech form a count takes: one, a few (2 to 4), or many. */
function czechForm(n: number) {
  if (n === 1) return 0;
  if (Number.isInteger(n) && n >= 2 && n <= 4) return 1;
  return 2;
}

/**
 * A count with its words, in the chosen language: tn(3, "{n} book", "{n} books").
 * {n} is the count; other {names} come from values.
 */
export function tn(n: number, one: string, many: string, values?: Record<string, string | number>): string {
  const all = { n, ...values };
  if (current === "en") return fill(n === 1 ? one : many, all);
  const forms = dictionaries[current][`${one}|${many}`]?.split("|");
  if (!forms) return fill(n === 1 ? one : many, all);
  return fill(forms[current === "cs" ? czechForm(n) : n === 1 ? 0 : 1] ?? forms.at(-1)!, all);
}
