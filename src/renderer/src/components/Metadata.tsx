import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft01Icon, Search01Icon, SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import type { Book, MetadataCandidate } from "../../../shared/types";
import {
  Badge, Button, Checkbox, Dialog, DialogFooter, DialogHeader, EASE, Input, Skeleton, SwitchRow, Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow, Tooltip, toast,
} from "@/components/ui";
import { Empty, List, Row } from "@/components/bits";
import { api } from "@/lib/api";
import { saveCover } from "@/lib/books";
import { flashMood, patchBooks, upsert, useStore } from "@/lib/store";
import { similarity } from "@/lib/util";
import { Cover } from "./Cover";
import { t } from "../../../shared/i18n";

const close = () => useStore.setState({ dialog: null });

const SOURCES = { openlibrary: "Open Library", google: "Google Books" } as const;

type Scored = MetadataCandidate & { score: number; reasons: string[] };

/** How likely a result is the same book, and why. */
function score(book: Book, c: MetadataCandidate): Scored {
  if (book.isbn && c.isbn && book.isbn.replace(/-/g, "") === c.isbn) return { ...c, score: 0.98, reasons: [t("Same ISBN")] };
  const same = Math.max(similarity(book.title, c.title), similarity(book.title.split(":")[0], c.title.split(":")[0]));
  const a = book.authors.length && c.authors.length ? Math.max(...book.authors.flatMap((x) => c.authors.map((y) => similarity(x, y)))) : 0.5;
  const reasons = [same > 0.85 ? t("Same title") : same > 0.6 ? t("Close title") : t("Another title")];
  if (book.authors.length) reasons.push(a > 0.8 ? t("same author") : a > 0.5 ? t("similar author") : t("another author"));
  if (!c.description) reasons.push(t("no description"));
  return { ...c, score: Math.min(0.97, same * 0.62 + a * 0.33 + (c.description ? 0.03 : 0) + (c.cover ? 0.02 : 0)), reasons };
}

type Key = "title" | "authors" | "series" | "publisher" | "published" | "language" | "isbn" | "tags" | "description";
const FIELDS: Array<[Key, string]> = [
  ["title", "Title"],
  ["authors", "Authors"],
  ["series", "Series"],
  ["publisher", "Publisher"],
  ["published", "Published"],
  ["language", "Language"],
  ["isbn", "ISBN"],
  ["tags", "Tags"],
  ["description", "Description"],
];

const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "");

function Match({ value, reasons }: { value: number; reasons: string[] }) {
  const tone = value >= 0.75 ? "success" : "neutral";
  return (
    <Tooltip content={reasons.join(", ")}>
      <span><Badge tone={tone}>{value >= 0.75 ? t("Match") : value >= 0.45 ? t("Maybe") : t("Unlikely")}</Badge></span>
    </Tooltip>
  );
}

export function MetadataDialog({ id }: { id: string }) {
  const book = useStore((s) => s.books.find((b) => b.id === id));
  const [query, setQuery] = useState(() => ({ title: book?.title ?? "", author: book?.authors[0] ?? "" }));
  const [busy, setBusy] = useState(true);
  const [results, setResults] = useState<Scored[]>([]);
  const [picked, setPicked] = useState<Scored | null>(null);
  const [chosen, setChosen] = useState<Set<Key>>(new Set());
  const [useCover, setUseCover] = useState(true);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!book) return;
    let alive = true;
    setBusy(true);
    setResults([]);
    useStore.setState({ mood: "curious" });
    const q = { title: query.title, author: query.author || undefined, isbn: run === 0 ? book.isbn : undefined };
    const look = async (source: "openlibrary" | "google") => {
      try {
        let found = await api.searchMetadata(source, q);
        // An ISBN that finds nothing falls back to the title.
        if (!found.length && q.isbn) found = await api.searchMetadata(source, { ...q, isbn: undefined });
        if (alive) setResults((r) => [...r, ...found.map((c) => score(book, c))].sort((a, b) => b.score - a.score));
      } catch {
        // One catalogue not answering still leaves the other.
      }
    };
    Promise.all([look("openlibrary"), look("google")]).finally(() => {
      if (!alive) return;
      setBusy(false);
      useStore.setState({ mood: null });
    });
    return () => {
      alive = false;
      useStore.setState({ mood: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Only fills in, never blanks out something the book already has.
  const proposed = useMemo<Partial<Record<Key, unknown>>>(() => {
    if (!picked || !book) return {};
    return {
      title: picked.title || book.title,
      authors: picked.authors.length ? picked.authors : book.authors,
      series: picked.series || book.series,
      publisher: picked.publisher || book.publisher,
      published: picked.published || book.published,
      language: picked.language || book.language,
      isbn: picked.isbn || book.isbn,
      tags: picked.tags.length ? [...new Set([...book.tags, ...picked.tags])].slice(0, 10) : book.tags,
      description: picked.description || book.description,
    };
  }, [picked, book]);
  const changed = FIELDS.filter(([key]) => book && show(proposed[key]) !== show(book[key]));

  useEffect(() => {
    // Empty fields are filled by default. Ones the book already has wait for a tick.
    if (book) setChosen(new Set(changed.filter(([key]) => !show(book[key])).map(([key]) => key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  if (!book) return null;

  const apply = async () => {
    const patch: Partial<Book> = {};
    for (const key of chosen) (patch as Record<string, unknown>)[key] = proposed[key];
    close();
    if (Object.keys(patch).length) await patchBooks([id], () => patch, true);
    if (useCover && picked?.cover) {
      try {
        const bytes = await api.download(picked.cover);
        // Some services answer a missing cover with a tiny placeholder.
        if (bytes.length > 2000) upsert(await saveCover(id, new Blob([bytes as BlobPart])));
      } catch {
        toast.error(t("The new cover could not be downloaded"));
      }
    }
    flashMood("happy");
    toast.success(t("Details updated"));
  };

  return (
    <Dialog open onClose={close} label={t("Find details online")} className="sm:max-w-[680px]">
      <AnimatePresence mode="wait" initial={false}>
        {!picked ? (
          <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
            <DialogHeader title={t("Find details online")} description={t("Searches Open Library and Google Books for the description, publisher and a better cover.")} />
            <form
              className="flex gap-2 px-6 pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                setRun((n) => n + 1);
              }}
            >
              <Input className="flex-[1.6]" value={query.title} placeholder={t("Title")} onChange={(e) => setQuery({ ...query, title: e.target.value })} />
              <Input className="flex-1" value={query.author} placeholder={t("Author")} onChange={(e) => setQuery({ ...query, author: e.target.value })} />
              <Button type="submit" variant="primary" icon={Search01Icon} square aria-label={t("Search")} />
            </form>
            <div className="scroll max-h-[52vh] px-6 pt-4 pb-6">
              {busy && !results.length ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => <Skeleton key={i} height={76} />)}
                </div>
              ) : !results.length ? (
                <Empty point={{ shape: "pebble", mood: "confused" }}>
                  <p className="text-[15px] font-medium text-foreground">{t("Nothing found")}</p>
                  <p className="mt-1">{t("Try a shorter title, or leave the author out.")}</p>
                </Empty>
              ) : (
                <List inset>
                  {results.map((c) => (
                    <Row key={c.url + c.title} className="flex-nowrap gap-3.5 px-3 py-3">
                      <div className="h-[60px] w-10 shrink-0 overflow-hidden rounded-[3px] bg-control shadow-[var(--shadow-book)]">
                        {c.cover && <img src={c.cover} alt="" className="size-full object-cover" loading="lazy" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-label font-medium">{c.title}</p>
                        <p className="line-clamp-1 text-caption text-muted">{c.authors.join(", ") || t("Unknown author")}</p>
                        <p className="mt-1 line-clamp-1 text-caption text-muted">
                          {[SOURCES[c.source], c.published?.slice(0, 4), c.publisher].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      <Match value={c.score} reasons={c.reasons} />
                      <Button size="sm" onClick={() => setPicked(c)}>{t("Review")}</Button>
                    </Row>
                  ))}
                </List>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="review" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.25, ease: EASE } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
            <DialogHeader title={t("Choose what to keep")} description={t("From {source}. Ticked rows replace what the book has now.", { source: SOURCES[picked.source] })} />
            <div className="scroll flex max-h-[54vh] flex-col gap-4 px-6 pt-5">
              {picked.cover && (
                <div className="flex items-center gap-4 rounded-field border border-border bg-well p-3">
                  <Cover book={book} className="w-11 shrink-0" />
                  <span className="text-muted">{t("to")}</span>
                  <img src={picked.cover} alt="" className="h-[66px] w-11 shrink-0 rounded-[6px] object-cover shadow-[var(--shadow-book)]" />
                  <div className="min-w-0 flex-1">
                    <SwitchRow label={t("Use the new cover")} checked={useCover} onChange={setUseCover} />
                  </div>
                </div>
              )}
              {changed.length === 0 ? (
                <p className="py-6 text-center text-label text-muted">{t("The book already has everything this result knows.")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"><span className="sr-only">{t("Use")}</span></TableHead>
                      <TableHead>{t("Field")}</TableHead>
                      <TableHead>{t("Now")}</TableHead>
                      <TableHead>{t("New")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changed.map(([key, label]) => (
                      <TableRow key={key} selected={chosen.has(key)}>
                        <TableCell>
                          <Checkbox
                            aria-label={t("Use the new {field}", { field: t(label).toLowerCase() })}
                            checked={chosen.has(key)}
                            onChange={(on) => setChosen((s) => {
                              const next = new Set(s);
                              if (on) next.add(key);
                              else next.delete(key);
                              return next;
                            })}
                          />
                        </TableCell>
                        <TableCell className="text-muted">{t(label)}</TableCell>
                        <TableCell className="max-w-[200px] text-muted"><span className="line-clamp-3">{show(book[key]) || t("Empty")}</span></TableCell>
                        <TableCell className="max-w-[240px]"><span className="line-clamp-3">{show(proposed[key])}</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" icon={ArrowLeft01Icon} className="sm:mr-auto" onClick={() => setPicked(null)}>{t("Results")}</Button>
              <Button variant="ghost" iconAfter={SquareArrowUpRightIcon} onClick={() => api.openExternal(picked.url)}>{t("Open page")}</Button>
              <Button variant="primary" disabled={!chosen.size && !(useCover && picked.cover)} onClick={apply}>{t("Apply")}</Button>
            </DialogFooter>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
