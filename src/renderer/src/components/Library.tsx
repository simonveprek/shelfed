import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import {
  ArrowDataTransferHorizontalIcon, ArrowRight01Icon, BookOpen01Icon, CheckmarkCircle02Icon, Delete02Icon, FavouriteIcon,
  FileAddIcon, Folder01Icon, FolderAddIcon, FolderOpenIcon, Layers01Icon, LibraryIcon, MagicWand01Icon, MailSend01Icon, PencilEdit02Icon, Tablet01Icon,
} from "@hugeicons/core-free-icons";
import type { Book } from "../../../shared/types";
import { Badge, Button, ContextMenu, cx, DataTable, EASE, Icon, MenuItem, MenuLabel, MenuSeparator, Progress, type DataTableColumn } from "@/components/ui";
import { Empty } from "@/components/bits";
import { addToCollection, joinSelected, openReader, pickAndImport, removeFromCollection } from "@/lib/actions";
import { api, isMac, revealLabel } from "@/lib/api";
import { newCollection, runAction } from "@/lib/commands";
import { useCalibre } from "@/lib/findcalibre";
import { startWithClassics } from "@/lib/free";
import { useOnKindle } from "@/lib/kindle";
import { BOOK_MIME, selectBook, targetIds } from "@/lib/select";
import { useStore } from "@/lib/store";
import { authorsOf, bytes, date, plural } from "@/lib/util";
import { groupKeys, sortBooks, useVisibleBooks } from "@/lib/view";
import { Bookcase } from "./Bookcase";
import { Discover } from "./Discover";
import { Cover } from "./Cover";
import { t, tn } from "../../../shared/i18n";

/* ------------------------------------------------------------------------ */
/* The menu every book has, on a right click                                 */
/* ------------------------------------------------------------------------ */

export function BookMenu({ ids }: { ids: string[] }) {
  // Filtered outside the selector: a new list from it on every look sends React round in circles.
  const all = useStore((s) => s.books);
  const books = useMemo(() => all.filter((b) => ids.includes(b.id)), [all, ids]);
  const collections = useStore((s) => s.collections);
  const section = useStore((s) => s.section);
  const one = books.length === 1 ? books[0] : null;
  if (!books.length)
    return (
      <>
        <MenuItem icon={FileAddIcon} onSelect={() => pickAndImport(false)}>{t("Add books")}</MenuItem>
        <MenuItem icon={FolderAddIcon} onSelect={() => pickAndImport(true)}>{t("Add a folder of books")}</MenuItem>
      </>
    );
  return (
    <>
      {one && <MenuItem icon={BookOpen01Icon} onSelect={() => runAction("read", ids)}>{t("Read")}</MenuItem>}
      <MenuItem icon={MailSend01Icon} onSelect={() => runAction("send", ids)}>{t("Send to Kindle")}</MenuItem>
      <MenuItem icon={ArrowDataTransferHorizontalIcon} onSelect={() => runAction("convert", ids)}>{t("Convert")}</MenuItem>
      {one && <MenuItem icon={MagicWand01Icon} onSelect={() => runAction("metadata", ids)}>{t("Find details online")}</MenuItem>}
      {one && <MenuItem icon={PencilEdit02Icon} onSelect={() => runAction("edit", ids)}>{t("Edit details")}</MenuItem>}
      <MenuSeparator />
      <MenuLabel>{t("Add to a collection")}</MenuLabel>
      {collections.map((c) => (
        <MenuItem key={c.id} icon={Folder01Icon} selected={books.every((b) => b.collections.includes(c.id))} onSelect={() => addToCollection(ids, c.id)}>
          {c.name}
        </MenuItem>
      ))}
      <MenuItem icon={FolderAddIcon} onSelect={() => newCollection(ids)}>{t("New collection")}</MenuItem>
      {section.kind === "collection" && (
        <MenuItem icon={Folder01Icon} onSelect={() => removeFromCollection(ids, section.id)}>
          {t("Take out of this collection")}
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={FavouriteIcon} selected={books.every((b) => b.favorite)} onSelect={() => runAction("favorite", ids)}>{t("Favorite")}</MenuItem>
      <MenuItem icon={CheckmarkCircle02Icon} selected={books.every((b) => b.status === "finished")} onSelect={() => runAction(books.every((b) => b.status === "finished") ? "unread" : "finished", ids)}>
        {t("Read it")}
      </MenuItem>
      {one && <MenuItem icon={FolderOpenIcon} onSelect={() => api.reveal(one.id)}>{t(revealLabel)}</MenuItem>}
      {books.length > 1 && <MenuItem icon={Layers01Icon} onSelect={() => joinSelected(ids)}>{t("Join into one book")}</MenuItem>}
      <MenuSeparator />
      <MenuItem icon={Delete02Icon} danger onSelect={() => runAction("remove", ids)}>
        {books.length > 1 ? tn(books.length, "Remove {n} book", "Remove {n} books") : t("Remove from library")}
      </MenuItem>
    </>
  );
}

/** One right click menu for a whole view. The book under the pointer picks the items. */
export function BooksMenu({ children }: { children: React.ReactNode }) {
  const selection = useStore((s) => s.selection);
  return (
    <ContextMenu label={t("Book")} width={250} menu={<BookMenu ids={selection} />} className="h-full">
      {children}
    </ContextMenu>
  );
}

/* ------------------------------------------------------------------------ */
/* Shared                                                                    */
/* ------------------------------------------------------------------------ */

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function dragBooks(e: DragEvent, id: string) {
  const { selection } = useStore.getState();
  const ids = selection.includes(id) ? selection : [id];
  if (!selection.includes(id)) useStore.setState({ selection: [id], anchor: id });
  e.dataTransfer.setData(BOOK_MIME, JSON.stringify(ids));
  e.dataTransfer.effectAllowed = "copy";
  // Changing the page in dragstart itself can cancel the drag, so wait a frame.
  requestAnimationFrame(() => useStore.setState({ carrying: ids }));
  const done = () => {
    useStore.setState({ carrying: null });
    window.removeEventListener("dragend", done);
    window.removeEventListener("drop", done);
  };
  window.addEventListener("dragend", done);
  window.addEventListener("drop", done);
}

/** Arrow keys move through books, Enter opens one. */
export function useKeys(visible: Book[], columns: number, scrollTo: (index: number) => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.reading || s.dialog || s.confirmRemove || s.palette) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).closest?.("[role=menu],[role=dialog]")) return;
      const current = visible.findIndex((b) => b.id === (s.anchor ?? s.selection[0]));
      const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
      if (e.key === "Enter" && current !== -1) {
        e.preventDefault();
        openReader(visible[current].id);
      } else if (e.key === "a" && (isMac ? e.metaKey : e.ctrlKey)) {
        e.preventDefault();
        useStore.setState({ selection: visible.map((b) => b.id) });
      } else if (e.key === "Escape") useStore.setState({ selection: [] });
      else if (e.key in moves) {
        const next = current === -1 ? 0 : current + moves[e.key];
        if (next < 0 || next >= visible.length) return;
        e.preventDefault();
        selectBook(e.shiftKey ? e : null, visible[next].id, visible);
        if (!e.shiftKey) useStore.setState({ anchor: visible[next].id });
        scrollTo(next);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [visible, columns, scrollTo]);
}

/* ------------------------------------------------------------------------ */
/* Covers                                                                    */
/* ------------------------------------------------------------------------ */

const BookCard = memo(function BookCard({ book, selected, width, visible, onKindle = false }: { book: Book; selected: boolean; width: number; visible: Book[]; onKindle?: boolean }) {
  const progress = book.status === "reading" ? (book.progress ?? 0) : 0;
  return (
    <div
      className="group flex flex-col"
      style={{ width }}
      onMouseDown={(e) => e.button === 0 && selectBook(e, book.id, visible)}
      onContextMenu={() => targetIds(book.id)}
      onDoubleClick={() => openReader(book.id)}
      draggable
      onDragStart={(e) => dragBooks(e, book.id)}
    >
      <div
        className="relative rounded-[6px] transition-[transform,box-shadow] duration-250 ease-smooth group-hover:-translate-y-[3px]"
        style={{
          boxShadow: selected ? "0 0 0 2px var(--background), 0 0 0 4px var(--accent), var(--shadow-book-hover)" : "var(--shadow-book)",
        }}
      >
        <Cover book={book} />
        {!book.parsed && <div className="absolute inset-0 animate-[shimmer_1.8s_linear_infinite] rounded-[6px] bg-[linear-gradient(110deg,transparent_35%,rgb(255_255_255/0.2)_50%,transparent_65%)] bg-[length:250%_100%]" />}
        {book.favorite && (
          <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
            <Icon icon={FavouriteIcon} size={12} />
          </span>
        )}
        {onKindle && (
          <span title={t("On your Kindle")} className="absolute top-1.5 left-1.5 flex h-6 items-center gap-1 rounded-full bg-black/45 px-2 text-[10.5px] font-medium text-white backdrop-blur-md">
            <Icon icon={Tablet01Icon} size={11} />
            Kindle
          </span>
        )}
        {progress > 0 && (
          <div className="absolute inset-x-2 bottom-2 rounded-full bg-black/35 p-px backdrop-blur-md">
            <div className="h-[3px] rounded-full bg-white" style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="mt-3 min-w-0 px-0.5">
        <p className={cx("line-clamp-2 text-label leading-snug font-medium", selected && "text-accent")}>{book.title}</p>
        <p className="mt-0.5 truncate text-caption text-muted">
          {book.series && book.seriesIndex ? `${book.series} ${book.seriesIndex}, ` : ""}
          {authorsOf(book)}
        </p>
      </div>
    </div>
  );
});

export function Grid({ visible }: { visible: Book[] }) {
  const onKindle = useOnKindle();
  const size = useStore((s) => s.settings.gridSize);
  const selection = useStore((s) => s.selection);
  const [ref, width] = useWidth<HTMLDivElement>();
  const pad = 24;
  const gap = Math.round(size * 0.16) + 12;
  const columns = Math.max(1, Math.floor((width - pad * 2 + gap) / (size + gap)));
  // The spare room goes to the covers, so rows sit flush on both sides.
  const cell = width ? Math.floor((width - pad * 2 - gap * (columns - 1)) / columns) : size;
  const rowHeight = Math.round(cell * 1.5) + 58 + Math.round(gap * 0.7);
  const selected = useMemo(() => new Set(selection), [selection]);

  const virtual = useVirtualizer({
    count: Math.ceil(visible.length / columns),
    getScrollElement: () => ref.current,
    estimateSize: () => rowHeight,
    overscan: 3,
    paddingStart: 24,
    paddingEnd: 96,
  });
  useEffect(() => virtual.measure(), [rowHeight, virtual]);
  useKeys(visible, columns, (i) => virtual.scrollToIndex(Math.floor(i / columns), { align: "auto" }));

  return (
    <BooksMenu>
      <div
        ref={ref}
        className="scroll h-full"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.row !== undefined) useStore.setState({ selection: [] });
        }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.row !== undefined) useStore.setState({ selection: [] });
        }}
      >
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((row) => (
            <div
              key={row.key}
              data-row=""
              className="absolute left-0 flex w-full"
              style={{ transform: `translateY(${row.start}px)`, height: rowHeight, gap, padding: `0 ${pad}px` }}
            >
              {visible.slice(row.index * columns, row.index * columns + columns).map((book) => (
                <BookCard key={book.id} book={book} width={cell} selected={selected.has(book.id)} visible={visible} onKindle={onKindle?.has(book.id)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </BooksMenu>
  );
}

/* ------------------------------------------------------------------------ */
/* List, on the kit's DataTable                                              */
/* ------------------------------------------------------------------------ */

const STATUS = { unread: "Want to read", reading: "Reading", finished: "Finished" } as const;

export function List({ visible }: { visible: Book[] }) {
  const selection = useStore((s) => s.selection);
  const columns: DataTableColumn<Book>[] = useMemo(
    () => [
      {
        id: "title",
        header: t("Title"),
        sortValue: (b) => b.title.toLowerCase(),
        cell: (b) => (
          <button
            className="flex min-w-0 items-center gap-3 text-left"
            onClick={(e) => selectBook(e, b.id, visible)}
            onDoubleClick={() => openReader(b.id)}
            onContextMenu={() => targetIds(b.id)}
            draggable
            onDragStart={(e) => dragBooks(e, b.id)}
          >
            <Cover book={b} className="w-7 shrink-0 rounded-[3px] shadow-[var(--shadow-book)]" />
            <span className="min-w-0">
              <span className="line-clamp-1 font-medium">{b.title}</span>
              <span className="line-clamp-1 text-caption text-muted">{authorsOf(b)}</span>
            </span>
          </button>
        ),
      },
      // Series only earns a column once some book has one.
      ...(visible.some((b) => b.series)
        ? [{ id: "series", header: t("Series"), hideOnMobile: true, sortValue: (b: Book) => b.series ?? "~", cell: (b: Book) => <span className="text-muted">{b.series ? `${b.series}${b.seriesIndex ? ` ${b.seriesIndex}` : ""}` : ""}</span> }]
        : []),
      {
        id: "progress",
        header: t("Progress"),
        sortValue: (b) => (b.status === "finished" ? 2 : (b.progress ?? 0)),
        cell: (b) =>
          b.status === "reading" ? (
            <div className="w-24"><Progress size="sm" value={(b.progress ?? 0) * 100} aria-label={t("Progress")} /></div>
          ) : (
            <span className="whitespace-nowrap text-muted">{t(STATUS[b.status])}</span>
          ),
      },
      { id: "formats", header: t("Files"), hideOnMobile: true, cell: (b) => <span className="flex gap-1">{b.formats.map((f) => <Badge key={f.ext}>{f.ext.toUpperCase()}</Badge>)}</span> },
      { id: "size", header: t("Size"), align: "right", sortValue: (b) => b.formats.reduce((n, f) => n + f.size, 0), cell: (b) => <span className="whitespace-nowrap text-muted tabular-nums">{bytes(b.formats.reduce((n, f) => n + f.size, 0))}</span> },
      { id: "added", header: t("Added"), align: "right", sortValue: (b) => b.added, cell: (b) => <span className="whitespace-nowrap text-muted tabular-nums">{date(b.added)}</span> },
    ],
    [visible],
  );
  return (
    <BooksMenu>
      <div className="scroll h-full px-6 pt-5 pb-24">
        <DataTable
          rows={visible}
          columns={columns}
          rowId={(b) => b.id}
          label={t("Books")}
          selectable
          selected={selection}
          onSelectedChange={(ids) => useStore.setState({ selection: ids, anchor: ids[ids.length - 1] ?? null })}
          pageSizes={[50, 100, 250]}
        />
      </div>
    </BooksMenu>
  );
}

/* ------------------------------------------------------------------------ */
/* Shelves, a row of covers per author, series, tag or format                */
/* ------------------------------------------------------------------------ */

const Shelf = memo(function Shelf({ name, books, visible, by }: { name: string; books: Book[]; visible: Book[]; by: "author" | "series" | "tag" | "format" }) {
  const onKindle = useOnKindle();
  const selection = useStore((s) => s.selection);
  return (
    <section className="pb-10">
      <button
        onClick={() => useStore.setState({ section: { kind: "group", by, value: name }, selection: [] })}
        className="group mb-4 flex items-center gap-2 px-6 text-left"
      >
        <span className="text-heading group-hover:text-accent">{name}</span>
        <span className="text-label text-muted">{plural(books.length, "book")}</span>
        <Icon icon={ArrowRight01Icon} size={15} className="text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
      </button>
      <div className="scroll flex gap-5 overflow-y-hidden px-6 pt-1 pb-3" style={{ scrollbarWidth: "none" }}>
        {books.map((book) => (
          <BookCard key={book.id} book={book} width={116} selected={selection.includes(book.id)} visible={visible} onKindle={onKindle?.has(book.id)} />
        ))}
      </div>
    </section>
  );
});

export function Shelves({ visible }: { visible: Book[] }) {
  const section = useStore((s) => s.section);
  const by = section.kind === "browse" || section.kind === "group" ? section.by : "author";
  const groups = useMemo(() => {
    const map = new Map<string, Book[]>();
    for (const book of visible)
      for (const key of groupKeys(book, by)) {
        const list = map.get(key);
        if (list) list.push(book);
        else map.set(key, [book]);
      }
    return [...map.entries()]
      .map(([name, books]) => [name, by === "series" ? sortBooks(books, "series", "asc") : books] as const)
      .sort((a, b) => (by === "tag" || by === "format" ? b[1].length - a[1].length : a[0].localeCompare(b[0])));
  }, [visible, by]);
  const ref = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({ count: groups.length, getScrollElement: () => ref.current, estimateSize: () => 300, overscan: 2, paddingStart: 28, paddingEnd: 60 });

  if (!groups.length)
    return (
      <Centered>
        <Empty point={{ shape: "cookie", mood: "curious" }}>
          <p className="text-[15px] font-medium text-foreground">{t("Nothing to show yet")}</p>
          <p className="mt-1">{by === "series" ? t("Books from a series gather here once their details say so. Find details online to fill them in.") : t("As your library grows, it sorts itself here.")}</p>
        </Empty>
      </Centered>
    );

  return (
    <BooksMenu>
      <div ref={ref} className="scroll h-full">
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((row) => (
            <div key={row.key} ref={virtual.measureElement} data-index={row.index} className="absolute left-0 w-full" style={{ transform: `translateY(${row.start}px)` }}>
              <Shelf name={groups[row.index][0]} books={groups[row.index][1] as Book[]} visible={visible} by={by} />
            </div>
          ))}
        </div>
      </div>
    </BooksMenu>
  );
}

/* ------------------------------------------------------------------------ */
/* Empty states                                                              */
/* ------------------------------------------------------------------------ */

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-8"><div className="w-full max-w-[460px]">{children}</div></div>;
}

const EMPTY: Record<string, string> = {
  collection: "Drag covers onto this collection in the sidebar, or right click a book to add it.",
  reading: "Books you open show up here, so you can pick up where you left off.",
  favorites: "Heart a book to keep it close.",
  finished: "Books you finish land here.",
  unread: "Books you have not started wait here.",
  recent: "Books added in the last two weeks show up here.",
};

/**
 * The page for the section and view, coming in each time either changes.
 * Only coming in: the page going out would already show the new books.
 */
export function LibraryView() {
  const section = useStore((s) => s.section);
  const view = useStore((s) => s.settings.view);
  const key = JSON.stringify(section) + (section.kind === "browse" || section.kind === "discover" ? "" : view);
  return (
    <motion.div
      key={key}
      className="absolute inset-0"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: EASE }}
    >
      <Page />
    </motion.div>
  );
}

function Page() {
  const visible = useVisibleBooks();
  const calibre = useCalibre();
  const [fetching, setFetching] = useState(false);
  const view = useStore((s) => s.settings.view);
  const section = useStore((s) => s.section);
  const total = useStore((s) => s.books.length);
  const query = useStore((s) => s.query);

  if (section.kind === "discover") return <Discover />;
  if (!total)
    return (
      <Centered>
        <Empty point={{ shape: "squircle", mood: "reading" }}>
          <p className="text-heading text-foreground">{t("A home for your books")}</p>
          <p className="mt-2">{t("Add EPUB, Kindle, PDF, comic and text files. Shelfed reads their covers and details and keeps them in one tidy folder.")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon={FileAddIcon} onClick={() => pickAndImport(false)}>{t("Add books")}</Button>
            <Button icon={FolderAddIcon} onClick={() => pickAndImport(true)}>{t("Add a folder")}</Button>
            <Button
              icon={LibraryIcon}
              disabled={fetching}
              onClick={async () => {
                setFetching(true);
                await startWithClassics().finally(() => setFetching(false));
              }}
            >
              {fetching ? t("Fetching classics…") : t("Start with a few classics")}
            </Button>
          </div>
          {calibre && (
            <button
              type="button"
              className="mt-4 text-label text-muted underline decoration-line-strong underline-offset-4 hover:text-foreground"
              onClick={() => useStore.setState({ dialog: { kind: "calibre", path: calibre.path, books: calibre.books } })}
            >
              {t("Bring over your Calibre library, {books}", { books: plural(calibre.books, "book") })}
            </button>
          )}
          <p className="mt-4 text-caption">
            {t("Or drop files anywhere on this window, or {browse}.")
              .split(/(\{browse\})/)
              .map((part, i) =>
                part === "{browse}" ? (
                  <button key={i} className="underline decoration-underline underline-offset-4 hover:text-foreground" onClick={() => useStore.setState({ section: { kind: "discover" } })}>
                    {t("browse the classics")}
                  </button>
                ) : (
                  part
                ),
              )}
          </p>
        </Empty>
      </Centered>
    );
  if (section.kind === "browse") return <Shelves visible={visible} />;
  if (!visible.length)
    return (
      <Centered>
        <Empty point={{ shape: query ? "pebble" : "cookie", mood: query ? "confused" : "idle" }}>
          <p className="text-[15px] font-medium text-foreground">{query ? t("Nothing found") : t("Nothing here yet")}</p>
          <p className="mt-1">{query ? t("No book matches {query}. Try a title, an author, a series or a tag.", { query }) : t(EMPTY[section.kind] ?? "Books show up here as you read.")}</p>
        </Empty>
      </Centered>
    );
  if (view === "list") return <List visible={visible} />;
  if (view === "shelves") return <Shelves visible={visible} />;
  if (view === "bookcase") return <Bookcase visible={visible} />;
  return <Grid visible={visible} />;
}
