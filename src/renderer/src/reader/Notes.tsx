import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Bookmark01Icon, Cancel01Icon, Copy01Icon, Delete02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import type { Annotation, Book } from "../../../shared/types";
import { Button, cx, EASE, Empty, Icon, IconButton, Input, Panel, Spinner, Textarea, toast } from "@/components/ui";
import { annotationsMarkdown, bookmarksOf, highlightsOf, logReading, removeAnnotation, updateAnnotation } from "@/lib/annotations";

/** Highlight colours, soft enough to read through on any page. */
export const MARKS: Record<NonNullable<Annotation["color"]>, string> = {
  yellow: "#f5c84c",
  green: "#7fcf8f",
  blue: "#7fb2f5",
  pink: "#f59ac0",
};

/* ------------------------------------------------------------------------ */
/* Reading time                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Counts the time a book is really being read: the window has focus and
 * something happened in the last two minutes. It saves once a minute and
 * when the book closes.
 */
export function useReadingTime(bookId: string) {
  const last = useRef(Date.now());
  useEffect(() => {
    const touch = () => (last.current = Date.now());
    const events = ["mousemove", "keydown", "wheel", "pointerdown"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    let pending = 0;
    const tick = setInterval(() => {
      if (document.hasFocus() && Date.now() - last.current < 120_000) pending += 5;
      if (pending >= 60) {
        logReading(bookId, pending);
        pending = 0;
      }
    }, 5000);
    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, touch));
      logReading(bookId, pending);
    };
  }, [bookId]);
  // Page turns inside the book's own frame count as activity too.
  return useCallback(() => {
    last.current = Date.now();
  }, []);
}

/* ------------------------------------------------------------------------ */
/* What the reader marked                                                    */
/* ------------------------------------------------------------------------ */

function Swatches({ value, onPick }: { value?: Annotation["color"]; onPick: (c: NonNullable<Annotation["color"]>) => void }) {
  return (
    <div className="flex gap-1.5">
      {(Object.keys(MARKS) as Array<keyof typeof MARKS>).map((c) => (
        <button
          key={c}
          aria-label={c}
          onClick={() => onPick(c)}
          className={cx("size-6 rounded-full transition-transform duration-150 hover:scale-110", value === c && "shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--foreground)]")}
          style={{ background: MARKS[c] }}
        />
      ))}
    </div>
  );
}

/** The bar over selected words. */
export function SelectionBar({
  x, y, onHighlight, onNote, onCopy,
}: {
  x: number;
  y: number;
  onHighlight: (c: NonNullable<Annotation["color"]>) => void;
  onNote: () => void;
  onCopy: () => void;
}) {
  return (
    <motion.div
      className="fixed z-[60] -translate-x-1/2 -translate-y-full"
      style={{ left: x, top: y - 10 }}
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE } }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 p-1.5 pl-3 text-foreground shadow-float backdrop-blur-xl">
        <Swatches onPick={onHighlight} />
        <span className="mx-1 h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" className="text-foreground" onClick={onNote}>Note</Button>
        <IconButton label="Copy" icon={Copy01Icon} onClick={onCopy} />
      </div>
    </motion.div>
  );
}

/** A highlight, opened to write a note, change its colour or let it go. */
export function AnnotationCard({
  annotation, bookId, x, y, onClose,
}: {
  annotation: Annotation;
  bookId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const [note, setNote] = useState(annotation.note ?? "");
  const save = () => {
    if ((annotation.note ?? "") !== note.trim()) updateAnnotation(bookId, annotation.id, { note: note.trim() || undefined });
    onClose();
  };
  const left = Math.min(Math.max(16, x - 160), window.innerWidth - 336);
  const top = Math.min(y + 12, window.innerHeight - 260);
  return (
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={save} />
      <motion.div
        className="fixed z-[61] w-[320px]"
        style={{ left, top }}
        initial={{ opacity: 0, y: -6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: EASE } }}
      >
        <Panel className="flex flex-col gap-3 p-4 shadow-float">
          {annotation.text && (
            <p className="serif line-clamp-3 border-l-2 pl-3 text-[14px] leading-snug" style={{ borderColor: MARKS[annotation.color ?? "yellow"] }}>
              {annotation.text}
            </p>
          )}
          <Textarea autoFocus autoResize rows={2} className="max-h-40" placeholder="Write a note" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center justify-between">
            <Swatches value={annotation.color} onPick={(color) => updateAnnotation(bookId, annotation.id, { color })} />
            <div className="flex gap-1">
              <IconButton
                label="Remove highlight"
                icon={Delete02Icon}
                onClick={() => {
                  removeAnnotation(bookId, annotation.id);
                  onClose();
                }}
              />
              <Button size="sm" variant="primary" onClick={save}>Done</Button>
            </div>
          </div>
        </Panel>
      </motion.div>
    </>
  );
}

/** Every highlight, note and bookmark in a book, to jump back to. */
export function NotesList({ book, onGo, onFind }: { book: Book; onGo: (a: Annotation) => void; onFind?: (text: string) => void }) {
  const highlights = highlightsOf(book);
  const bookmarks = bookmarksOf(book);
  if (!highlights.length && !bookmarks.length)
    return <Empty icon={Bookmark01Icon} title="Nothing marked yet" description="Select words to highlight them or add a note. Bookmark a page from the bar at the top." />;
  return (
    <div className="flex flex-col gap-6">
      {bookmarks.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-caption font-medium text-muted">Bookmarks</h3>
          <div className="flex flex-col">
            {bookmarks.map((b) => (
              <div key={b.id} className="group flex items-center gap-2 rounded-item px-2 py-2 hover:bg-control">
                <button className="min-w-0 flex-1 text-left" onClick={() => onGo(b)}>
                  <span className="line-clamp-1 text-label">{b.chapter || "Page"}</span>
                  {b.fraction !== undefined && <span className="text-caption text-muted tabular-nums">{Math.round(b.fraction * 100)}%</span>}
                </button>
                <span className="opacity-0 transition-opacity group-hover:opacity-100">
                  <IconButton label="Remove bookmark" icon={Cancel01Icon} onClick={() => removeAnnotation(book.id, b.id)} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {highlights.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-caption font-medium text-muted">Highlights and notes</h3>
            <button
              className="text-caption font-medium text-muted hover:text-foreground"
              onClick={() => {
                navigator.clipboard.writeText(annotationsMarkdown(book));
                toast.success("Copied as Markdown");
              }}
            >
              Copy all
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {highlights.map((h) => (
              <button
                key={h.id}
                className="rounded-item px-2 py-2.5 text-left hover:bg-control"
                onClick={() => (h.cfi ? onGo(h) : h.text && onFind?.(h.text))}
              >
                {h.text && (
                  <span className="serif line-clamp-4 border-l-2 pl-3 text-[14px] leading-snug" style={{ borderColor: h.kind === "kindle" ? "var(--line-strong)" : MARKS[h.color ?? "yellow"] }}>
                    {h.text}
                  </span>
                )}
                {h.note && <span className="mt-1.5 block pl-3 text-label text-muted">{h.note}</span>}
                <span className="mt-1 block pl-3 text-caption text-muted">
                  {h.kind === "kindle" ? `From Kindle${h.where ? `, ${h.where}` : ""}` : h.chapter}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Search                                                                    */
/* ------------------------------------------------------------------------ */

export type SearchHit = { key: string; label: string; pre: string; match: string; post: string; go: () => void };

/** A search box over the results it finds, as they arrive. */
export function SearchPanel({
  run, query: initial = "",
}: {
  /** Searches, calling back with hits and progress until done. */
  run: (query: string, found: (hits: SearchHit[]) => void, progress: (share: number) => void, signal: { stop: boolean }) => Promise<void>;
  query?: string;
}) {
  const [query, setQuery] = useState(initial);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(0);
  const [done, setDone] = useState(false);
  const signal = useRef({ stop: false });

  const start = async (q: string) => {
    signal.current.stop = true;
    const mine = { stop: false };
    signal.current = mine;
    setHits([]);
    setDone(false);
    if (q.trim().length < 2) return;
    setBusy(true);
    await run(q.trim(), (more) => !mine.stop && setHits((h) => [...h, ...more]), (p) => !mine.stop && setShare(p), mine).catch(() => {});
    if (!mine.stop) {
      setBusy(false);
      setDone(true);
    }
  };

  useEffect(() => {
    if (initial) start(initial);
    return () => {
      signal.current.stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          start(query);
        }}
        className="flex gap-2"
      >
        <Input autoFocus placeholder="Words in this book" value={query} onChange={(e) => setQuery(e.target.value)} />
        <IconButton label="Search" icon={Search01Icon} variant="secondary" size="md" type="submit" />
      </form>
      {busy && (
        <div className="flex items-center gap-2 text-caption text-muted">
          <Spinner size="sm" /> Searching, {Math.round(share * 100)}%
        </div>
      )}
      {done && <p className="text-caption text-muted">{hits.length ? `${hits.length} found` : "Not in this book"}</p>}
      <div className="flex flex-col">
        {hits.slice(0, 400).map((h) => (
          <button key={h.key} className="rounded-item px-2 py-2.5 text-left hover:bg-control" onClick={h.go}>
            <span className="block text-caption text-muted">{h.label}</span>
            <span className="serif mt-0.5 line-clamp-3 text-[14px] leading-snug">
              {h.pre}
              <mark className="rounded-[3px] bg-[#f5c84c]/60 px-0.5 text-inherit">{h.match}</mark>
              {h.post}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={cx("h-8 rounded-full px-3 text-label transition-colors duration-150", active ? "bg-control text-foreground" : "text-muted hover:text-foreground")}>
      {children}
    </button>
  );
}

export { Icon };
