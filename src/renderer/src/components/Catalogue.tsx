import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Add01Icon, ArrowLeft01Icon, ArrowRight01Icon, Delete02Icon, LockIcon, MoreHorizontalIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { Catalogue, CatalogueBook, CataloguePage } from "../../../shared/types";
import { Button, Dialog, DialogFooter, DialogHeader, EASE, Field, Icon, IconButton, Input, Menu, MenuItem, SearchField, Skeleton, Spinner, toast } from "@/components/ui";
import { Empty } from "@/components/bits";
import { importPaths } from "@/lib/actions";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { norm } from "@/lib/util";
import { t } from "../../../shared/i18n";

/*
 * Catalogues you add yourself, next to the free classics: a Calibre content
 * server at home, a library's, or anything else that speaks OPDS. Shelfed
 * shows its shelves and books, and adding one downloads it into the library.
 */

/** A catalogue's picture as the page can show it: one written into the feed as it is, any other through Shelfed. */
const picture = (url?: string) => (!url ? undefined : url.startsWith("data:image/") ? url : `shelf://catalogue/?u=${encodeURIComponent(url)}`);

const close = () => useStore.setState({ dialog: null });

/** Shows the catalogues you have now, after one is added or removed. */
const keep = (catalogues: Catalogue[]) => useStore.setState((s) => ({ settings: { ...s.settings, catalogues } }));

export function AddCatalogue() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const add = async () => {
    if (!address.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      const catalogues = await api.addCatalogue(address);
      keep(catalogues);
      const added = catalogues[catalogues.length - 1];
      useStore.setState({ dialog: null, section: { kind: "catalogue", id: added.id }, selection: [] });
      toast.success(t("Added {name}", { name: added.name }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };
  return (
    <Dialog open onClose={close} label={t("Add a catalogue")}>
      <DialogHeader title={t("Add a catalogue")} description={t("Any OPDS catalogue: a Calibre content server, a library's, or one a reading app told you about.")} />
      <form
        className="px-6 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label={t("Address")} hint={t("Calibre's looks like http://192.168.1.10:8080/opds")} error={error}>
          <Input autoFocus placeholder="https://" value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} />
        </Field>
      </form>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>{t("Cancel")}</Button>
        <Button variant="primary" icon={adding ? <Spinner size="sm" /> : Add01Icon} disabled={!address.trim() || adding} onClick={add}>
          {adding ? t("Adding") : t("Add")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/** Downloads a book a catalogue offers and adds it to the library. */
async function addFromCatalogue(book: CatalogueBook) {
  if (!book.file) return false;
  let path: string | null = null;
  try {
    path = await api.downloadFromCatalogue(book.file.url, book.title, book.file.ext);
    await importPaths([path]);
    return true;
  } catch (e) {
    toast.error((e as Error).message);
    return false;
  } finally {
    // The library has its own copy now.
    if (path) api.forgetDownload(path);
  }
}

type State = "idle" | "adding" | "owned" | "locked";

function Cover({ book, big }: { book: CatalogueBook; big?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const src = picture(big ? (book.bigCover ?? book.cover) : book.cover);
  return (
    <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-[6px] bg-tile shadow-[var(--shadow-book)]">
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          data-loaded={loaded}
          onLoad={() => setLoaded(true)}
          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          className="cover-img absolute inset-0 size-full object-cover"
        />
      )}
      {!loaded && (
        <span className="absolute inset-0 flex items-center justify-center p-4 text-center">
          <span className="serif line-clamp-5 text-[15px] leading-snug">{book.title}</span>
        </span>
      )}
    </span>
  );
}

function AddButton({ state, onAdd, className }: { state: State; onAdd: () => void; className?: string }) {
  return (
    <Button
      size="sm"
      variant={state === "idle" || state === "adding" ? "primary" : "secondary"}
      icon={state === "adding" ? <Spinner size="sm" /> : state === "owned" ? Tick02Icon : state === "locked" ? LockIcon : Add01Icon}
      disabled={state !== "idle"}
      onClick={onAdd}
      className={className}
    >
      {state === "owned" ? t("In Shelfed") : state === "adding" ? t("Adding") : state === "locked" ? t("Not free") : t("Add")}
    </Button>
  );
}

function BookInfo({ book, state, onAdd, onClose }: { book: CatalogueBook; state: State; onAdd: () => void; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} label={book.title} className="sm:max-w-[520px]">
      <div className="scroll flex max-h-[60vh] gap-5 p-6">
        <span className="w-[120px] shrink-0">
          <Cover book={book} big />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="serif text-[20px] leading-snug font-medium">{book.title}</h2>
          {book.authors.length > 0 && <p className="mt-1 text-label text-muted">{book.authors.join(", ")}</p>}
          {(book.published || book.file) && (
            <p className="mt-1 text-caption text-muted">{[book.published?.slice(0, 4), book.file?.ext.toUpperCase()].filter(Boolean).join(" · ")}</p>
          )}
          {book.summary && <p className="selectable serif mt-4 text-[14px] leading-relaxed whitespace-pre-line">{book.summary}</p>}
          {state === "locked" && <p className="mt-4 text-label text-muted">{t("This catalogue only sells or lends this one, or locks it with DRM, so Shelfed can't add it.")}</p>}
        </div>
      </div>
      <DialogFooter className="pt-0">
        <Button variant="ghost" onClick={onClose}>{t("Close")}</Button>
        <AddButton state={state} onAdd={onAdd} />
      </DialogFooter>
    </Dialog>
  );
}

function BookCard({ book, state, onAdd, index }: { book: CatalogueBook; state: State; onAdd: () => void; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      className="group flex flex-col"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, delay: Math.min(index, 12) * 0.03, ease: EASE } }}
    >
      <div className="relative transition-transform duration-250 ease-smooth group-hover:-translate-y-[3px]">
        <Cover book={book} />
        <button aria-label={book.title} onClick={() => setOpen(true)} className="absolute inset-0" />
        <div className={`pointer-events-none absolute inset-x-2 bottom-2 flex justify-end transition-opacity duration-150 ${state !== "idle" ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
          <AddButton state={state} onAdd={onAdd} className="pointer-events-auto shadow-float" />
        </div>
      </div>
      <button tabIndex={-1} aria-hidden onClick={() => setOpen(true)} className="text-left">
        <span className="mt-3 line-clamp-2 text-label leading-snug font-medium">{book.title}</span>
        <span className="mt-0.5 line-clamp-1 text-caption text-muted">{book.authors.join(", ")}</span>
      </button>
      {open && <BookInfo book={book} state={state} onAdd={onAdd} onClose={() => setOpen(false)} />}
    </motion.div>
  );
}

const SKELETON = (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-8">
    {Array.from({ length: 12 }, (_, i) => (
      <div key={i}>
        <Skeleton className="aspect-[2/3] w-full" />
        <Skeleton shape="line" className="mt-3 w-3/4" />
      </div>
    ))}
  </div>
);

/** A catalogue you added: its shelves to go into, its books to add, and a search when it has one. */
export function CatalogueView({ id }: { id: string }) {
  const catalogue = useStore((s) => s.settings.catalogues?.find((c) => c.id === id));
  const library = useStore((s) => s.books);
  // Where you've been in it, the page you're on last.
  const [trail, setTrail] = useState<CataloguePage[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [more, setMore] = useState(false);

  // What was asked last, to ask again after it failed.
  const last = useRef<{ load: () => Promise<CataloguePage>; replace: boolean } | null>(null);
  const open = async (load: () => Promise<CataloguePage>, replace = false) => {
    last.current = { load, replace };
    setLoading("page");
    setError(null);
    try {
      const page = await load();
      setTrail((t) => (replace ? [page] : [...t, page]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    setTrail([]);
    if (catalogue) open(() => api.cataloguePage(catalogue.url), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogue?.url]);

  const owned = useMemo(() => new Set(library.map((b) => `${norm(b.title)}|${norm(b.authors[0] ?? "")}`)), [library]);
  const titles = useMemo(() => new Set(library.map((b) => norm(b.title))), [library]);
  if (!catalogue) return null;

  const page = trail[trail.length - 1];
  const search = page?.search ?? trail.find((p) => p.search)?.search;
  const stateOf = (book: CatalogueBook): State =>
    busy.has(book.id) ? "adding" : owned.has(`${norm(book.title)}|${norm(book.authors[0] ?? "")}`) || titles.has(norm(book.title)) ? "owned" : book.file ? "idle" : "locked";

  const add = async (book: CatalogueBook) => {
    setBusy((s) => new Set(s).add(book.id));
    await addFromCatalogue(book);
    setBusy((s) => {
      const next = new Set(s);
      next.delete(book.id);
      return next;
    });
  };

  const loadMore = async () => {
    if (!page?.next) return;
    setMore(true);
    try {
      const next = await api.cataloguePage(page.next);
      setTrail((t) => [...t.slice(0, -1), { ...page, books: [...page.books, ...next.books], places: [...page.places, ...next.places], next: next.next }]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMore(false);
    }
  };

  const remove = async () => {
    keep(await api.removeCatalogue(catalogue.id));
    useStore.setState({ section: { kind: "discover" } });
    toast(t("Removed {name}", { name: catalogue.name }), { description: t("The books you added from it stay in your library.") });
  };

  const back = trail.length > 1 ? trail[trail.length - 2] : null;
  const host = (() => {
    try {
      return new URL(catalogue.url).host;
    } catch {
      return catalogue.url;
    }
  })();

  return (
    <div className="scroll h-full">
      <div className="mx-auto max-w-[1180px] px-6 pt-8 pb-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-[46ch]">
            {back && (
              <button onClick={() => setTrail((t) => t.slice(0, -1))} className="mb-2 flex items-center gap-1 text-label text-muted hover:text-foreground">
                <Icon icon={ArrowLeft01Icon} size={14} />
                <span className="truncate">{trail.length === 2 ? catalogue.name : back.title}</span>
              </button>
            )}
            <h2 className="serif text-[32px] leading-tight font-medium tracking-[-0.015em]">{trail.length > 1 ? page?.title || catalogue.name : catalogue.name}</h2>
            <p className="mt-2 text-label text-muted">{host}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {search && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) open(() => api.searchCatalogue(search, query).then((found) => ({ ...found, title: t("Results for {query}", { query }) })));
                }}
              >
                <SearchField placeholder={t("Title or author")} value={query} onChange={(e) => setQuery(e.target.value)} className="w-[220px]" />
              </form>
            )}
            <Menu label={t("Catalogue")} align="end" width={220} trigger={({ props, open }) => <IconButton {...props} label={t("Catalogue")} icon={MoreHorizontalIcon} active={open} />}>
              <MenuItem icon={Delete02Icon} danger onSelect={remove}>{t("Remove this catalogue")}</MenuItem>
            </Menu>
          </div>
        </div>

        {error ? (
          <Empty point={{ shape: "pebble", mood: "sad" }}>
            <p className="text-[15px] font-medium text-foreground">{t("The catalogue did not answer")}</p>
            <p className="mt-1">{error}</p>
            <div className="mt-4 flex justify-center gap-2">
              {page && <Button size="sm" variant="ghost" onClick={() => setError(null)}>{t("Back")}</Button>}
              <Button size="sm" onClick={() => last.current && open(last.current.load, last.current.replace)}>{t("Try again")}</Button>
            </div>
          </Empty>
        ) : loading || !page ? (
          SKELETON
        ) : page.places.length === 0 && page.books.length === 0 ? (
          <Empty point={{ shape: "pebble", mood: "confused" }}>
            <p className="text-[15px] font-medium text-foreground">{t("Nothing here")}</p>
            <p className="mt-1">{t("This part of the catalogue is empty.")}</p>
          </Empty>
        ) : (
          <>
            {page.places.length > 0 && (
              <div className="mb-10 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                {page.places.map((place) => (
                  <button
                    key={place.url + place.title}
                    onClick={() => open(() => api.cataloguePage(place.url))}
                    className="flex items-center gap-3 rounded-item border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-control"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-label font-medium">{place.title}</span>
                      {place.summary && <span className="line-clamp-1 text-caption text-muted">{place.summary}</span>}
                    </span>
                    <Icon icon={ArrowRight01Icon} size={14} className="shrink-0 text-muted" />
                  </button>
                ))}
              </div>
            )}
            {page.books.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-8">
                {page.books.map((book, i) => (
                  <BookCard key={`${book.id}-${i}`} book={book} index={i} state={stateOf(book)} onAdd={() => add(book)} />
                ))}
              </div>
            )}
            {page.next && (
              <div className="mt-10 flex justify-center">
                <Button icon={more ? <Spinner size="sm" /> : undefined} disabled={more} onClick={loadMore}>{t("Show more")}</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
