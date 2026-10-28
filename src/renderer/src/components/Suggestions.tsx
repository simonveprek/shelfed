import { useEffect, useMemo, useState } from "react";
import { Add01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { Book, FreeBook } from "../../../shared/types";
import { Button, Spinner } from "@/components/ui";
import { addFree, findFree } from "@/lib/free";
import { seedsOf, suggestionsFor, type Suggestion } from "@/lib/recommend";
import { useStore } from "@/lib/store";
import { Cover } from "./Cover";

const select = (id: string) => useStore.setState({ selection: [id] });

/** A free classic's Gutenberg edition, once it has been looked up. */
function useFree(title: string, author: string) {
  const [free, setFree] = useState<FreeBook | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    findFree(title, author).then((b) => alive && setFree(b));
    return () => {
      alive = false;
    };
  }, [title, author]);
  return free;
}

function FreeThumb({ src, title }: { src?: string; title: string }) {
  const [ok, setOk] = useState(true);
  return (
    <span className="relative block aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-[3px] bg-tile shadow-[var(--shadow-book)]">
      {src && ok ? (
        <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="serif absolute inset-0 flex items-center justify-center p-1 text-center text-[7px] leading-tight">{title}</span>
      )}
    </span>
  );
}

function FreeRow({ s }: { s: Extract<Suggestion, { kind: "free" }> }) {
  const free = useFree(s.title, s.author);
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");
  return (
    <div className="flex items-center gap-3 rounded-item p-2">
      <FreeThumb src={free?.cover} title={s.title} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-label font-medium">{s.title}</span>
        <span className="line-clamp-1 text-caption text-muted">{s.author}</span>
        <span className="serif mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-muted italic">{s.why}</span>
      </span>
      {free !== null && (
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          icon={state === "adding" || free === undefined ? <Spinner size="sm" /> : state === "added" ? Tick02Icon : Add01Icon}
          disabled={!free || state !== "idle"}
          onClick={async () => {
            if (!free) return;
            setState("adding");
            setState((await addFree(free)) ? "added" : "idle");
          }}
        >
          {state === "added" ? "Added" : "Free"}
        </Button>
      )}
    </div>
  );
}

function OwnedRow({ book, why, note }: { book: Book; why: string; note?: string }) {
  return (
    <button onClick={() => select(book.id)} className="flex items-center gap-3 rounded-item p-2 text-left hover:bg-control">
      <Cover book={book} className="w-10 shrink-0 rounded-[3px] shadow-[var(--shadow-book)]" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-label font-medium">{book.title}</span>
        <span className="line-clamp-1 text-caption text-muted">{note ?? (book.status === "finished" ? "Read" : "In your library")}</span>
        {why && <span className="serif mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-muted italic">{why}</span>}
      </span>
    </button>
  );
}

/** Books that go with this one: yours first, then free classics. */
export function Kindred({ book }: { book: Book }) {
  const books = useStore((s) => s.books);
  const list = useMemo(() => suggestionsFor(book, books), [book, books]);
  if (!list.length) return null;
  return (
    <div className="-mx-2 flex flex-col">
      {list.map((s) =>
        s.kind === "owned" ? <OwnedRow key={s.book.id} book={s.book} why={s.why} /> : <FreeRow key={s.title} s={s} />,
      )}
    </div>
  );
}

export const hasKindred = (book: Book, books: Book[]) => suggestionsFor(book, books).length > 0;

/** For the Classics page: the best free classics to follow what you've read, one per title. */
export function useBecauseYouRead(limit = 3) {
  const books = useStore((s) => s.books);
  return useMemo(() => {
    const picks = new Map<string, Extract<Suggestion, { kind: "free" }> & { after: Book }>();
    for (const seed of seedsOf(books))
      for (const s of suggestionsFor(seed, books, 8))
        if (s.kind === "free" && (picks.get(s.title)?.score ?? -1) < s.score) picks.set(s.title, { ...s, after: seed });
    return [...picks.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }, [books, limit]);
}

export { useFree };
