import type { Annotation, Book } from "../../../shared/types";
import { api } from "./api";
import { bookById, patchBooks, useStore } from "./store";

export const newAnnotationId = () => Math.random().toString(36).slice(2, 11);

export const highlightsOf = (book: Book) => (book.annotations ?? []).filter((a) => a.kind !== "bookmark");
export const bookmarksOf = (book: Book) => (book.annotations ?? []).filter((a) => a.kind === "bookmark");

export function addAnnotation(bookId: string, annotation: Annotation) {
  return patchBooks([bookId], (b) => ({ annotations: [...(b.annotations ?? []), annotation] }));
}

export function updateAnnotation(bookId: string, id: string, patch: Partial<Annotation>) {
  return patchBooks([bookId], (b) => ({ annotations: (b.annotations ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
}

export function removeAnnotation(bookId: string, id: string) {
  return patchBooks([bookId], (b) => ({ annotations: (b.annotations ?? []).filter((a) => a.id !== id) }));
}

/** A book's highlights as Markdown, for copying into notes elsewhere. */
export function annotationsMarkdown(book: Book) {
  const lines = [`# ${book.title}`, book.authors.length ? `*${book.authors.join(", ")}*` : "", ""];
  for (const a of highlightsOf(book)) {
    if (a.chapter || a.where) lines.push(`### ${a.chapter ?? a.where}`);
    if (a.text) lines.push(`> ${a.text.replace(/\n+/g, " ")}`);
    if (a.note) lines.push("", a.note);
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

/** Adds reading time on screen at once, and in the library behind. */
export function logReading(id: string, seconds: number) {
  if (seconds < 1) return;
  useStore.setState((s) => ({
    books: s.books.map((b) => (b.id === id ? { ...b, readSeconds: (b.readSeconds ?? 0) + seconds } : b)),
  }));
  api.logReading(id, seconds);
}

export { bookById };
