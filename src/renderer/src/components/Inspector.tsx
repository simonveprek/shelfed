import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Add01Icon, ArrowDataTransferHorizontalIcon, BookOpen01Icon, Cancel01Icon, CheckmarkCircle02Icon, Delete02Icon,
  FavouriteIcon, Folder01Icon, FolderAddIcon, FolderOpenIcon, Image01Icon, MagicWand01Icon, MailSend01Icon,
  MoreHorizontalIcon, PencilEdit02Icon, StarIcon, BarCode02Icon, Building03Icon, Calendar03Icon, CalendarAdd01Icon, Clock01Icon,
  Copy01Icon, Tick02Icon,
} from "@hugeicons/core-free-icons";
import type { Book, ReadStatus } from "../../../shared/types";
import {
  Badge, Button, Chip, cx, EASE, Icon, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, Panel, Progress, Segmented, Tooltip, toast,
  type IconLike,
} from "@/components/ui";
import { Stat } from "@/components/bits";
import { addToCollection, canRead, openReader, removeFromCollection, toggleFavorite } from "@/lib/actions";
import { api, revealLabel } from "@/lib/api";
import { saveCover } from "@/lib/books";
import { newCollection, runAction } from "@/lib/commands";
import { patchBooks, upsert, useStore } from "@/lib/store";
import { ago, authorsOf, bytes, coverUrl, date, duration, plural, published } from "@/lib/util";
import { ColourPicker, RIBBONS, SPINES } from "./Colours";
import { hasKindred, Kindred } from "./Suggestions";
import { KindleDock, useHasKindle } from "./KindleDock";
import { Cover } from "./Cover";
import { annotationsMarkdown, highlightsOf } from "@/lib/annotations";

const LANGS = new Intl.DisplayNames("en", { type: "language" });
const language = (code?: string) => {
  try {
    return code ? (LANGS.of(code) ?? code) : "";
  } catch {
    return code ?? "";
  }
};

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Panel className="mb-3" padded={false}>
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h3 className="text-label font-medium text-muted">{title}</h3>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </Panel>
  );
}

/** One value shared by every book, or "mixed" so no swatch looks picked. */
const shared = (books: Book[], key: "spine" | "ribbon") => (books.every((b) => b[key] === books[0][key]) ? books[0][key] : "mixed");

/** The spine and ribbon the books wear in the bookcase. */
function Look({ books }: { books: Book[] }) {
  const ids = books.map((b) => b.id);
  return (
    <Block title="In the bookcase">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-caption text-muted">Spine</span>
          <ColourPicker auto="As the bookcase colours it" value={shared(books, "spine")} options={SPINES} onChange={(spine) => patchBooks(ids, () => ({ spine }))} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-caption text-muted">Ribbon</span>
          <ColourPicker
            auto="Only while reading, in the bookcase's colour"
            none="No ribbon"
            value={shared(books, "ribbon")}
            options={RIBBONS}
            onChange={(ribbon) => patchBooks(ids, () => ({ ribbon }))}
          />
        </div>
      </div>
    </Block>
  );
}

/** The book's details: the ones worth a glance as tiles, the rest in rows. */
function Details({ book }: { book: Book }) {
  const year = book.published?.match(/^\d{4}/)?.[0];
  const tiles = [
    year && { value: year, label: "Published" },
    book.language && { value: language(book.language), label: "Language" },
    (book.readSeconds ?? 0) >= 60 && { value: duration(book.readSeconds ?? 0), label: "Read for" },
  ].filter(Boolean) as Array<{ value: string; label: string }>;
  const rows = [
    book.publisher && { icon: Building03Icon, label: "Publisher", value: book.publisher },
    // The full date, when the book knows more than its year.
    book.published && book.published.length > 4 && { icon: Calendar03Icon, label: "Published", value: published(book.published) },
    book.isbn && { icon: BarCode02Icon, label: "ISBN", value: <Isbn value={book.isbn} /> },
    { icon: CalendarAdd01Icon, label: "Added", value: date(book.added) },
    book.opened && { icon: Clock01Icon, label: "Last opened", value: ago(book.opened) },
  ].filter(Boolean) as Array<{ icon: IconLike; label: string; value: ReactNode }>;

  return (
    <>
      {tiles.length > 0 && (
        <div className={cx("mb-2 grid divide-x divide-border overflow-hidden rounded-[14px] bg-well", ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"][tiles.length])}>
          {tiles.map((tile) => (
            <div key={tile.label} className="min-w-0 px-3 py-2.5">
              <p className="truncate text-[15px] leading-tight font-medium tracking-[-0.01em] tabular-nums" title={tile.value}>{tile.value}</p>
              <p className="mt-0.5 text-caption text-muted">{tile.label}</p>
            </div>
          ))}
        </div>
      )}
      <div className="-mb-1 divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2.5 py-2.5 text-label">
            <Icon icon={row.icon} size={15} className="shrink-0 text-muted" />
            <span className="shrink-0 text-muted">{row.label}</span>
            <span className="selectable min-w-0 flex-1 truncate text-right" title={typeof row.value === "string" ? row.value : undefined}>{row.value}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** An ISBN that copies itself when clicked. */
function Isbn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="group inline-flex items-center gap-1.5 tabular-nums transition-colors hover:text-foreground"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      <Icon icon={copied ? Tick02Icon : Copy01Icon} size={13} className={cx("transition-opacity", copied ? "text-success opacity-100" : "text-muted opacity-0 group-hover:opacity-100")} />
      {value}
    </button>
  );
}

export function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="inline-flex" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} stars`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n === value ? 0 : n)}
          className={cx(
            "flex size-7 items-center justify-center transition-transform duration-150 hover:scale-110 active:scale-95",
            n <= shown ? "text-accent [&_path]:fill-current" : "text-line-strong",
          )}
        >
          <Icon icon={StarIcon} size={16} />
        </button>
      ))}
    </div>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 320;
  return (
    <div>
      <p className={cx("selectable serif text-[14px] leading-relaxed whitespace-pre-line", !open && long && "line-clamp-6")}>{text}</p>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-1.5 text-label font-medium text-accent">
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

function Tags({ book }: { book: Book }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-wrap gap-1.5">
      {book.tags.map((tag) => (
        <Chip key={tag} size="sm" title={tag} onClick={() => useStore.setState({ section: { kind: "group", by: "tag", value: tag } })}>
          <span className="max-w-[200px] truncate">{tag.replace(/\s*--\s*/g, ", ")}</span>
          <span
            role="button"
            aria-label={`Remove ${tag}`}
            className="-mr-1 ml-0.5 flex text-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              patchBooks([book.id], (b) => ({ tags: b.tags.filter((t) => t !== tag) }));
            }}
          >
            <Icon icon={Cancel01Icon} size={11} />
          </span>
        </Chip>
      ))}
      {adding ? (
        <input
          autoFocus
          className="h-8 w-28 rounded-full bg-control px-3 text-label outline-none"
          placeholder="Tag"
          onBlur={(e) => {
            const tag = e.target.value.trim();
            if (tag) patchBooks([book.id], (b) => ({ tags: [...new Set([...b.tags, tag])] }));
            setAdding(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setAdding(false);
          }}
        />
      ) : (
        <Chip size="sm" icon={Add01Icon} onClick={() => setAdding(true)}>Tag</Chip>
      )}
    </div>
  );
}

function Collections({ book }: { book: Book }) {
  const collections = useStore((s) => s.collections);
  return (
    <div className="flex flex-wrap gap-1.5">
      {collections
        .filter((c) => book.collections.includes(c.id))
        .map((c) => (
          <Chip key={c.id} size="sm" active icon={Folder01Icon} onClick={() => removeFromCollection([book.id], c.id)} aria-label={`Take out of ${c.name}`}>
            {c.name}
          </Chip>
        ))}
      <Menu
        label="Add to a collection"
        width={220}
        trigger={({ props }) => <Chip {...props} size="sm" icon={Add01Icon} onClick={props.onClick}>Collection</Chip>}
      >
        {collections.map((c) => (
          <MenuItem key={c.id} icon={Folder01Icon} selected={book.collections.includes(c.id)} onSelect={() => addToCollection([book.id], c.id)}>
            {c.name}
          </MenuItem>
        ))}
        {collections.length > 0 && <MenuSeparator />}
        <MenuItem icon={FolderAddIcon} onSelect={() => newCollection([book.id])}>New collection</MenuItem>
      </Menu>
    </div>
  );
}

const STATUS: Array<{ id: ReadStatus; label: string }> = [
  { id: "unread", label: "To read" },
  { id: "reading", label: "Reading" },
  { id: "finished", label: "Finished" },
];

function One({ book }: { book: Book }) {
  const [dropping, setDropping] = useState(false);
  const progress = book.progress ?? 0;
  const library = useStore((s) => s.books);
  const kindred = useMemo(() => hasKindred(book, library), [book, library]);
  const takeCover = async (blob: Blob) => {
    try {
      upsert(await saveCover(book.id, blob));
      toast.success("Cover changed");
    } catch {
      toast.error("That picture could not be used as a cover");
    }
  };

  return (
    <div className="p-3 pb-10">
      <Panel padded={false} className="mb-3 overflow-hidden">
        <div className="relative flex justify-center overflow-hidden bg-well px-6 pt-8 pb-7">
          {/* The cover's own colour, softly, behind it. */}
          {book.cover > 0 && <img src={coverUrl(book)} alt="" className="pointer-events-none absolute inset-0 size-full scale-150 object-cover opacity-25 blur-3xl saturate-150" />}
          <button
            className={cx("group relative w-[150px] transition-transform duration-250 ease-smooth hover:-translate-y-1", dropping && "scale-[1.03]")}
            onClick={() => openReader(book.id)}
            aria-label="Read"
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              e.stopPropagation();
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              setDropping(false);
              const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
              if (!file) return;
              e.preventDefault();
              e.stopPropagation();
              takeCover(file);
            }}
          >
            <Cover book={book} large style={{ boxShadow: dropping ? "0 0 0 3px var(--accent), var(--shadow-book-hover)" : "var(--shadow-book-hover)" }} />
            <span className="absolute inset-0 flex items-center justify-center rounded-[6px] bg-black/0 opacity-0 transition-all duration-150 group-hover:bg-black/25 group-hover:opacity-100">
              <span className="flex h-8 items-center gap-1.5 rounded-full bg-card px-3.5 text-label font-medium text-foreground shadow-float">
                <Icon icon={BookOpen01Icon} size={14} /> Read
              </span>
            </span>
          </button>
        </div>
        <div className="px-4 pt-4 pb-4 text-center">
          <h2 className="selectable serif text-[19px] leading-snug font-medium tracking-[-0.01em]" style={{ textWrap: "balance" }}>
            {book.title}
          </h2>
          <button
            className="mt-1 text-label text-muted hover:text-foreground"
            onClick={() => book.authors[0] && useStore.setState({ section: { kind: "group", by: "author", value: book.authors[0] } })}
          >
            {authorsOf(book)}
          </button>
          {book.series && (
            <p className="mt-0.5 text-caption text-muted">
              {book.series}
              {book.seriesIndex ? `, book ${book.seriesIndex}` : ""}
            </p>
          )}
          <div className="mt-2 flex items-center justify-center gap-1">
            <Stars value={book.rating} onChange={(rating) => patchBooks([book.id], () => ({ rating }))} />
            <Tooltip content={book.favorite ? "In favorites" : "Add to favorites"}>
              <button
                onClick={() => toggleFavorite([book.id])}
                aria-label="Favorite"
                className={cx("flex size-7 items-center justify-center transition-transform duration-150 hover:scale-110", book.favorite ? "text-danger [&_path]:fill-current" : "text-line-strong")}
              >
                <Icon icon={FavouriteIcon} size={16} />
              </button>
            </Tooltip>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button variant="primary" icon={BookOpen01Icon} onClick={() => openReader(book.id)} className="w-full">
              {book.status === "reading" && progress >= 0.01 ? `Continue at ${Math.round(progress * 100)}%` : book.status === "finished" ? "Read again" : "Read"}
            </Button>
            <div className="flex gap-2">
              <Button size="sm" icon={MailSend01Icon} className="flex-1" onClick={() => runAction("send", [book.id])}>Kindle</Button>
              <Button size="sm" icon={ArrowDataTransferHorizontalIcon} className="flex-1" onClick={() => runAction("convert", [book.id])}>Convert</Button>
              <Menu label="More" align="end" width={230} trigger={({ props }) => <IconButton {...props} variant="secondary" label="More" icon={MoreHorizontalIcon} />}>
                <MenuItem icon={MagicWand01Icon} onSelect={() => runAction("metadata", [book.id])}>Find details online</MenuItem>
                <MenuItem icon={PencilEdit02Icon} onSelect={() => runAction("edit", [book.id])}>Edit details</MenuItem>
                <MenuItem
                  icon={Image01Icon}
                  onSelect={async () => {
                    const picked = await api.pickImage();
                    if (picked) takeCover(new Blob([picked as BlobPart]));
                  }}
                >
                  Change cover
                </MenuItem>
                <MenuItem icon={FolderOpenIcon} onSelect={() => api.reveal(book.id)}>{revealLabel}</MenuItem>
                <MenuSeparator />
                <MenuItem icon={Delete02Icon} danger onSelect={() => runAction("remove", [book.id])}>Remove from library</MenuItem>
              </Menu>
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="mb-3 p-3">
        <Segmented
          label="Reading status"
          size="sm"
          block
          value={book.status}
          onChange={(status) => patchBooks([book.id], () => ({ status, ...(status === "finished" ? { progress: 1 } : status === "unread" ? { progress: 0, location: undefined } : {}) }))}
          options={STATUS}
        />
        {book.status === "reading" && <Progress className="mt-3 px-1" size="sm" value={progress * 100} label="Read so far" showValue />}
      </Panel>

      {book.description && (
        <Block title="About">
          <Description text={book.description} />
        </Block>
      )}

      <Block title="Details" action={<Button size="sm" variant="ghost" className="-my-1 -mr-2 h-7" onClick={() => runAction("edit", [book.id])}>Edit</Button>}>
        <Details book={book} />
        {!book.publisher && !book.isbn && (
          <Button size="sm" variant="outline" icon={MagicWand01Icon} className="mt-2 w-full" onClick={() => runAction("metadata", [book.id])}>
            Find details online
          </Button>
        )}
      </Block>

      {highlightsOf(book).length > 0 && (
        <Block
          title={`Highlights, ${highlightsOf(book).length}`}
          action={
            <Button size="sm" variant="ghost" className="-my-1 -mr-2 h-7" onClick={() => { navigator.clipboard.writeText(annotationsMarkdown(book)); toast.success("Copied as Markdown"); }}>
              Copy
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            {highlightsOf(book).slice(-4).reverse().map((h) => (
              <div key={h.id}>
                {h.text && <p className="serif line-clamp-4 border-l-2 border-line-strong pl-3 text-[13.5px] leading-snug">{h.text}</p>}
                {h.note && <p className="mt-1 pl-3 text-caption text-muted">{h.note}</p>}
              </div>
            ))}
          </div>
          {highlightsOf(book).length > 4 && (
            <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => openReader(book.id)}>See all in the book</Button>
          )}
        </Block>
      )}

      {kindred && (
        <Block title="You may also like">
          <Kindred book={book} />
        </Block>
      )}

      <Block title="Files">
        <div className="-mx-2 flex flex-col">
          {book.formats.map((f) => (
            <div key={f.ext} className="group flex h-10 items-center gap-3 rounded-item px-2 hover:bg-control">
              <Badge>{f.ext.toUpperCase()}</Badge>
              <span className="flex-1 text-label text-muted tabular-nums">{bytes(f.size)}</span>
              <span className="flex opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {canRead(f.ext) && <IconButton label={`Read the ${f.ext.toUpperCase()}`} icon={BookOpen01Icon} onClick={() => openReader(book.id, f.ext)} />}
                <IconButton label={revealLabel} icon={FolderOpenIcon} onClick={() => api.reveal(book.id, f.ext)} />
                {book.formats.length > 1 && (
                  <IconButton label={`Remove the ${f.ext.toUpperCase()}`} icon={Delete02Icon} onClick={async () => upsert(await api.removeFormat(book.id, f.ext))} />
                )}
              </span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Collections">
        <Collections book={book} />
      </Block>

      <Block title="Tags">
        <Tags book={book} />
      </Block>

      <Look books={[book]} />
    </div>
  );
}

function Many({ books }: { books: Book[] }) {
  const collections = useStore((s) => s.collections);
  const ids = books.map((b) => b.id);
  const size = books.reduce((n, b) => n + b.formats.reduce((m, f) => m + f.size, 0), 0);
  const fan = books.slice(0, 5);
  const mid = (fan.length - 1) / 2;
  return (
    <div className="p-3">
      <Panel padded={false} className="overflow-hidden">
        <div className="relative h-[230px] bg-well">
          {fan.map((book, i) => (
            <motion.div
              key={book.id}
              className="absolute top-8 left-1/2 w-[112px]"
              initial={false}
              animate={{ x: -56 + (i - mid) * 24, rotate: (i - mid) * 6, y: Math.abs(i - mid) * 6 }}
              transition={{ duration: 0.4, ease: EASE }}
              style={{ zIndex: i, boxShadow: "var(--shadow-book-hover)", borderRadius: 6 }}
            >
              <Cover book={book} />
            </motion.div>
          ))}
        </div>
        <div className="p-4 text-center">
          <p className="text-heading">{plural(books.length, "book")}</p>
          <p className="mt-0.5 text-label text-muted">{bytes(size)} together</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="primary" icon={MailSend01Icon} onClick={() => runAction("send", ids)}>Send to Kindle</Button>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" icon={ArrowDataTransferHorizontalIcon} onClick={() => runAction("convert", ids)}>Convert</Button>
              <Button size="sm" className="flex-1" icon={FavouriteIcon} onClick={() => toggleFavorite(ids)}>Favorite</Button>
            </div>
            <div className="flex gap-2">
              <Menu label="Add to a collection" width={220} trigger={({ props }) => <Button {...props} size="sm" className="flex-1" icon={Folder01Icon}>Collection</Button>}>
                {collections.map((c) => (
                  <MenuItem key={c.id} icon={Folder01Icon} onSelect={() => addToCollection(ids, c.id)}>{c.name}</MenuItem>
                ))}
                {collections.length > 0 && <MenuSeparator />}
                <MenuItem icon={FolderAddIcon} onSelect={() => newCollection(ids)}>New collection</MenuItem>
              </Menu>
              <Menu label="Mark" align="end" width={190} trigger={({ props }) => <Button {...props} size="sm" className="flex-1" icon={CheckmarkCircle02Icon}>Mark</Button>}>
                <MenuLabel>Mark as</MenuLabel>
                {STATUS.map((s) => (
                  <MenuItem key={s.id} onSelect={() => runAction(s.id, ids)}>{s.label}</MenuItem>
                ))}
              </Menu>
            </div>
            <Button size="sm" variant="ghost" icon={Delete02Icon} className="mt-1 text-danger hover:text-danger" onClick={() => runAction("remove", ids)}>
              Remove {books.length} books
            </Button>
          </div>
        </div>
      </Panel>
      <div className="mt-3">
        <Look books={books} />
      </div>
    </div>
  );
}

function Overview() {
  const books = useStore((s) => s.books);
  const reading = useMemo(() => books.filter((b) => b.status === "reading").sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0)).slice(0, 5), [books]);
  const authors = useMemo(() => new Set(books.flatMap((b) => b.authors)).size, [books]);
  const finished = books.filter((b) => b.status === "finished").length;
  const carrying = useStore((s) => Boolean(s.carrying || s.kindleActivity));
  if (!books.length) return null;
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Books" value={books.length.toLocaleString()} hint={`${authors.toLocaleString()} authors`} />
        <Stat label="Finished" value={finished.toLocaleString()} hint={`${Math.round((finished / books.length) * 100)}% of them`} />
      </div>
      <Block title="Pick up where you left off">
        {reading.length === 0 && <p className="text-label text-muted">Books you start reading wait for you here. Double click a cover to open it.</p>}
        <div className="-mx-2 flex flex-col">
          {reading.map((book) => (
            <button key={book.id} onClick={() => openReader(book.id)} className="flex items-center gap-3 rounded-item p-2 text-left hover:bg-control">
              <Cover book={book} className="w-9 shrink-0 rounded-[3px] shadow-[var(--shadow-book)]" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-label font-medium">{book.title}</span>
                <Progress className="mt-2" size="sm" value={(book.progress ?? 0) * 100} aria-label="Progress" />
              </span>
            </button>
          ))}
        </div>
      </Block>
      {/* While books are dragged, the Kindle comes first so it's in reach. */}
      <div style={{ order: carrying ? -1 : undefined }}>
        <KindleDock />
      </div>
    </div>
  );
}

export function Inspector() {
  const hasKindle = useHasKindle();
  const selection = useStore((s) => s.selection);
  const books = useStore((s) => s.books);
  const selected = useMemo(() => books.filter((b) => selection.includes(b.id)), [books, selection]);
  // While books are dragged, the panel shows the Kindle to drop them on.
  // And stays there until the book it was given has gone across.
  const carrying = useStore((s) => Boolean(s.carrying || s.kindleActivity)) && hasKindle;
  const aside = useRef<HTMLElement>(null);
  // Back to the top, where the Kindle waits.
  useEffect(() => {
    if (carrying) aside.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [carrying]);
  const key = carrying ? "none" : selected.length === 1 ? selected[0].id : selected.length > 1 ? "many" : "none";
  return (
    <aside ref={aside} className="scroll relative h-full w-[340px] shrink-0 border-l border-border">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={key} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.25 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
          {carrying ? <Overview /> : selected.length === 1 ? <One book={selected[0]} /> : selected.length > 1 ? <Many books={selected} /> : <Overview />}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
