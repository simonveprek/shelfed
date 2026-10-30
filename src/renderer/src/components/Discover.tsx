import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Add01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { FreeBook } from "../../../shared/types";
import { Button, EASE, Icon, IconButton, SearchField, Segmented, Skeleton, Spinner, TextLink } from "@/components/ui";
import { Empty } from "@/components/bits";
import { api } from "@/lib/api";
import { addFree } from "@/lib/free";
import { useWidth } from "./Library";
import { FreeInfo, useBecauseYouRead, useFree } from "./Suggestions";
import { useStore } from "@/lib/store";
import { norm } from "@/lib/util";
import { t } from "../../../shared/i18n";

/*
 * Free books, inside the app. Standard Ebooks makes careful, beautiful
 * editions of public domain books. Project Gutenberg keeps the largest
 * library of them. Adding one downloads its EPUB into Shelfed.
 */

const SOURCES = {
  standard: { name: "Standard Ebooks", note: "Carefully made editions, new ones each week", home: "https://standardebooks.org" },
  gutenberg: { name: "Project Gutenberg", note: "Over 70,000 books, the most read first", home: "https://www.gutenberg.org" },
} as const;

type Source = keyof typeof SOURCES;

function FreeCard({ book, owned, onAdd, busy, index }: { book: FreeBook; owned: boolean; onAdd: () => void; busy: boolean; index: number }) {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      className="group flex flex-col"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, delay: Math.min(index, 12) * 0.03, ease: EASE } }}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-[6px] bg-tile shadow-[var(--shadow-book)] transition-transform duration-250 ease-smooth group-hover:-translate-y-[3px]">
        {book.cover && (
          <img
            src={book.cover}
            alt=""
            loading="lazy"
            data-loaded={loaded}
            onLoad={() => setLoaded(true)}
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            className="cover-img absolute inset-0 size-full object-cover"
          />
        )}
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
            <span className="serif line-clamp-5 text-[15px] leading-snug">{book.title}</span>
          </div>
        )}
        <button aria-label={book.title} onClick={() => setOpen(true)} className="absolute inset-0" />
        <div className={`pointer-events-none absolute inset-x-2 bottom-2 flex justify-end transition-opacity duration-150 ${owned || busy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
          <Button
            size="sm"
            variant={owned ? "secondary" : "primary"}
            icon={busy ? <Spinner size="sm" /> : owned ? Tick02Icon : Add01Icon}
            disabled={owned || busy}
            onClick={onAdd}
            className="pointer-events-auto shadow-float"
          >
            {owned ? t("In Shelfed") : busy ? t("Adding") : t("Add")}
          </Button>
        </div>
      </div>
      {/* The cover is the way in for the keyboard; the words are one more place to click. */}
      <button tabIndex={-1} aria-hidden onClick={() => setOpen(true)} className="text-left">
        <span className="mt-3 line-clamp-2 text-label leading-snug font-medium">{book.title}</span>
        <span className="mt-0.5 line-clamp-1 text-caption text-muted">{book.author}</span>
      </button>
      {open && <FreeInfo title={book.title} author={book.author} free={book} state={owned ? "owned" : busy ? "adding" : "idle"} onAdd={onAdd} onClose={() => setOpen(false)} />}
    </motion.div>
  );
}

/** A kindred classic, small: its cover, title and why, once its Gutenberg edition is found. */
function KindredItem({ title, author, why, after, owned, busy, onAdd }: {
  title: string;
  author: string;
  why: string;
  after: string;
  owned: (b: FreeBook) => boolean;
  busy: Set<string>;
  onAdd: (b: FreeBook) => void;
}) {
  const free = useFree(title, author);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  if (free === null) return null;
  const have = free ? owned(free) : false;
  const adding = free ? busy.has(free.id) : false;
  return (
    <div className="group -m-2 flex min-w-0 items-center gap-3 rounded-item p-2 hover:bg-control">
      <button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="relative aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-[3px] bg-tile shadow-[var(--shadow-book)]">
          {free?.cover && <img src={free.cover} alt="" data-loaded={loaded} onLoad={() => setLoaded(true)} className="cover-img absolute inset-0 size-full object-cover" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 text-label font-medium">{title}</span>
          <span className="line-clamp-1 text-caption text-muted" title={t("{why}. After {after}.", { why, after })}>
            {why}
          </span>
        </span>
      </button>
      <IconButton
        className="shrink-0"
        label={have ? t("{title} is in Shelfed", { title }) : t("Add {title}", { title })}
        icon={!free || adding ? <Spinner size="sm" /> : have ? Tick02Icon : Add01Icon}
        disabled={!free || have || adding}
        onClick={() => free && onAdd(free)}
      />
      {open && <FreeInfo title={title} author={author} why={why} free={free} state={have ? "owned" : adding ? "adding" : "idle"} onAdd={() => free && onAdd(free)} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** One quiet row of classics that follow from your reading: as many as fit, never a second row. */
function KindredStrip({ picks, owned, busy, onAdd }: {
  picks: ReturnType<typeof useBecauseYouRead>;
  owned: (b: FreeBook) => boolean;
  busy: Set<string>;
  onAdd: (b: FreeBook) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const fit = Math.max(1, Math.floor((width + 32) / (250 + 32)));
  return (
    <section className="mb-10 border-b border-border pb-8">
      <p className="mb-4 text-caption text-muted">{t("From what you’re reading")}</p>
      <div ref={ref} className="grid gap-x-8" style={{ gridTemplateColumns: `repeat(${fit}, minmax(0, 1fr))` }}>
        {picks.slice(0, fit).map((s) => (
          <KindredItem key={s.title} {...s} after={s.after.title.split(/[:;]/)[0]} owned={owned} busy={busy} onAdd={onAdd} />
        ))}
      </div>
    </section>
  );
}

export function Discover() {
  const library = useStore((s) => s.books);
  const [source, setSource] = useState<Source>("standard");
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const [results, setResults] = useState<FreeBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const kindred = useBecauseYouRead(4);

  useEffect(() => {
    let alive = true;
    setResults(null);
    setError(null);
    api
      .freeBooks(source, asked)
      .then((list) => alive && setResults(list))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [source, asked]);

  // A free book counts as owned when a book with its title and author is already here.
  const owned = useMemo(() => new Set(library.map((b) => `${norm(b.title)}|${norm(b.authors[0] ?? "")}`)), [library]);
  const isOwned = (b: FreeBook) => owned.has(`${norm(b.title)}|${norm(b.author)}`) || library.some((x) => norm(x.title) === norm(b.title));

  const add = async (book: FreeBook) => {
    setBusy((s) => new Set(s).add(book.id));
    await addFree(book);
    setBusy((s) => {
      const next = new Set(s);
      next.delete(book.id);
      return next;
    });
  };

  return (
    <div className="scroll h-full">
      <div className="mx-auto max-w-[1180px] px-6 pt-8 pb-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-[46ch]">
            <h2 className="serif text-[32px] leading-tight font-medium tracking-[-0.015em]">{t("Something to read next")}</h2>
            <p className="mt-2 text-label text-muted">
              {t("Free books from the public domain, from {standard} and {gutenberg}. Add one and it is yours to keep.")
                .split(/(\{standard\}|\{gutenberg\})/)
                .map((part, i) =>
                  part === "{standard}" ? (
                    <TextLink key={i} href={SOURCES.standard.home}>Standard Ebooks</TextLink>
                  ) : part === "{gutenberg}" ? (
                    <TextLink key={i} href={SOURCES.gutenberg.home}>Project Gutenberg</TextLink>
                  ) : (
                    part
                  ),
                )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={t("Catalogue")}
              size="sm"
              value={source}
              onChange={(s) => setSource(s)}
              options={[
                { id: "standard", label: "Standard Ebooks" },
                { id: "gutenberg", label: "Project Gutenberg" },
              ]}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAsked(query);
              }}
            >
              <SearchField
                placeholder={t("Title or author")}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!e.target.value) setAsked("");
                }}
                className="w-[220px]"
              />
            </form>
          </div>
        </div>

        {!asked && kindred.length > 0 && <KindredStrip picks={kindred} owned={isOwned} busy={busy} onAdd={add} />}

        <p className="mb-4 text-caption text-muted">
          {asked ? t("Results for {query}", { query: asked }) : source === "standard" ? t("Newly released") : t("Most read this month")}, {t(SOURCES[source].note).toLowerCase()}
        </p>

        {error ? (
          <Empty point={{ shape: "pebble", mood: "sad" }}>
            <p className="text-[15px] font-medium text-foreground">{t("The catalogue did not answer")}</p>
            <p className="mt-1">{t("{error}. Check your connection and try again.", { error })}</p>
          </Empty>
        ) : results === null ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-8">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[2/3] w-full" />
                <Skeleton shape="line" className="mt-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <Empty point={{ shape: "pebble", mood: "confused" }}>
            <p className="text-[15px] font-medium text-foreground">{t("Nothing found")}</p>
            <p className="mt-1">{t("Try another title or author, or the other catalogue.")}</p>
          </Empty>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-8">
            {results.map((book, i) => (
              <FreeCard key={book.id} book={book} index={i} owned={isOwned(book)} busy={busy.has(book.id)} onAdd={() => add(book)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { Icon };
