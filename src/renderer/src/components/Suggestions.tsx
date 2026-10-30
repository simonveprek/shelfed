import { useEffect, useMemo, useState } from "react";
import { Add01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { Book, FreeBook } from "../../../shared/types";
import { Button, Dialog, DialogFooter, Skeleton, Spinner, TextLink } from "@/components/ui";
import { addFree, findFree, findSummary } from "@/lib/free";
import { seedsOf, suggestionsFor, type Suggestion } from "@/lib/recommend";
import { useStore } from "@/lib/store";
import { Cover } from "./Cover";
import { language, t } from "../../../shared/i18n";

const select = (id: string) => useStore.setState({ selection: [id] });

/** "Read" as in finished, not the button that opens a book; Czech needs another word for it. */
const finished = () => (language() === "en" ? "Read" : t("Read (finished)"));

/** A free classic's Gutenberg edition, once it has been looked up. Asking again retries a lookup that failed. */
function useFree(title: string, author: string, again = false) {
  const [free, setFree] = useState<FreeBook | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (again) setFree((known) => known ?? undefined);
    findFree(title, author).then((b) => alive && setFree(b));
    return () => {
      alive = false;
    };
  }, [title, author, again]);
  return free;
}

function FreeThumb({ src, title, big }: { src?: string; title: string; big?: boolean }) {
  const [ok, setOk] = useState(true);
  return (
    <span className={`relative block aspect-[2/3] shrink-0 overflow-hidden rounded-[3px] bg-tile shadow-[var(--shadow-book)] ${big ? "w-24 self-start" : "w-10"}`}>
      {src && ok ? (
        <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className={`serif absolute inset-0 flex items-center justify-center p-1 text-center leading-tight ${big ? "text-[13px]" : "text-[7px]"}`}>{title}</span>
      )}
    </span>
  );
}

/** What a suggested book is, before deciding on it: its whole title, what it's about, and where it's from. */
export function FreeInfo({ title, author, why, free, state, onAdd, onClose }: {
  title: string;
  author: string;
  why?: string;
  free: FreeBook | null | undefined;
  state: "idle" | "adding" | "added" | "owned";
  onAdd: () => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!free) return;
    let alive = true;
    findSummary(free).then((text) => alive && setSummary(text));
    return () => {
      alive = false;
    };
  }, [free]);
  return (
    <Dialog open onClose={onClose} label={title} className="sm:max-w-[520px]">
      <div className="scroll flex max-h-[60vh] gap-5 p-6">
        <FreeThumb big src={free?.cover} title={title} />
        <div className="min-w-0 flex-1">
          <h2 className="serif text-[20px] leading-snug font-medium">{title}</h2>
          <p className="mt-1 text-label text-muted">{author}</p>
          {why && <p className="serif mt-2 text-[13.5px] leading-snug text-muted italic">{why}</p>}
          {free === null ? (
            <p className="mt-4 text-label text-muted">{t("Couldn't find a free copy of this one just now.")}</p>
          ) : summary === undefined ? (
            <div className="mt-4 flex flex-col gap-2">
              <Skeleton shape="line" className="w-full" />
              <Skeleton shape="line" className="w-full" />
              <Skeleton shape="line" className="w-2/3" />
            </div>
          ) : (
            summary && <p className="selectable serif mt-4 text-[14px] leading-relaxed">{summary}</p>
          )}
        </div>
      </div>
      <DialogFooter className="pt-0 sm:items-center">
        {free?.page && (
          <span className="text-label sm:mr-auto">
            <TextLink href={free.page}>{t("See it on {source}", { source: free.source === "standard" ? "Standard Ebooks" : "Project Gutenberg" })}</TextLink>
          </span>
        )}
        <Button variant="ghost" onClick={onClose}>{t("Close")}</Button>
        {free && (
          <Button
            icon={state === "adding" ? <Spinner size="sm" /> : state === "idle" ? Add01Icon : Tick02Icon}
            disabled={state !== "idle"}
            onClick={onAdd}
          >
            {state === "owned" ? t("In Shelfed") : state === "added" ? t("Added") : t("Add for free")}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}

function FreeRow({ s }: { s: Extract<Suggestion, { kind: "free" }> }) {
  const [open, setOpen] = useState(false);
  const free = useFree(s.title, s.author, open);
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");
  const add = async () => {
    if (!free) return;
    setState("adding");
    setState((await addFree(free)) ? "added" : "idle");
  };
  return (
    <div className="flex items-center gap-3 rounded-item p-2 hover:bg-control">
      <button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <FreeThumb src={free?.cover} title={s.title} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 text-label font-medium">{s.title}</span>
          <span className="line-clamp-1 text-caption text-muted">{s.author}</span>
          <span className="serif mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-muted italic">{s.why}</span>
        </span>
      </button>
      {free !== null && (
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          icon={state === "adding" || free === undefined ? <Spinner size="sm" /> : state === "added" ? Tick02Icon : Add01Icon}
          disabled={!free || state !== "idle"}
          onClick={add}
        >
          {state === "added" ? t("Added") : t("Free")}
        </Button>
      )}
      {open && <FreeInfo title={s.title} author={s.author} why={s.why} free={free} state={state} onAdd={add} onClose={() => setOpen(false)} />}
    </div>
  );
}

function OwnedRow({ book, why, note }: { book: Book; why: string; note?: string }) {
  return (
    <button onClick={() => select(book.id)} className="flex items-center gap-3 rounded-item p-2 text-left hover:bg-control">
      <Cover book={book} className="w-10 shrink-0 rounded-[3px] shadow-[var(--shadow-book)]" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-label font-medium">{book.title}</span>
        <span className="line-clamp-1 text-caption text-muted">{note ?? (book.status === "finished" ? finished() : t("In your library"))}</span>
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
