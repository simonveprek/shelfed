import { useEffect, useMemo, useState } from "react";
import { FileEditIcon } from "@hugeicons/core-free-icons";
import type { Block, PdfChapter, PdfOptions, Run } from "../../../shared/pdf-layout";
import { Alert, Button, Checkbox, cx, Dialog, DialogFooter, DialogHeader, Field, Input, Progress, Segmented, Spinner, SwitchRow, toast } from "@/components/ui";
import { api } from "@/lib/api";
import { baseContent } from "@/lib/books";
import { buildEpub } from "@/lib/epub";
import { chapterKey, closeStudy, cutPicture, layOutPdf, pdfContent, startingOptions, studyPdf, type ChapterEdits, type Picture, type PdfStudy } from "@/lib/pdf-epub";
import { upsert, useStore } from "@/lib/store";
import { fetchFile } from "@/lib/util";
import { t, tn } from "../../../shared/i18n";

/*
 * A PDF made into an EPUB, looked over first. Shelfed shows the chapters it
 * found and what each says, and every choice shows at once: what to leave
 * out, where chapters begin, their names, and which pages to take.
 */

const close = () => useStore.setState({ dialog: null });

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((run, i) => {
        let node: React.ReactNode = run.text;
        if (run.sup) node = <sup>{node}</sup>;
        if (run.italic) node = <i>{node}</i>;
        if (run.bold) node = <b>{node}</b>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

/** A picture as it will be in the book, cut from its page when it's first shown. */
function PicturePreview({ study, block }: { study: PdfStudy; block: Picture }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    cutPicture(study, block).then(
      (blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      },
      () => {},
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [study, block]);
  const ratio = block.picture.height / block.picture.width;
  return (
    <figure className="my-5 flex justify-center">
      {src ? (
        <img src={src} alt={t("Picture from page {page}", { page: String(block.page) })} className="max-h-[420px] max-w-full rounded-[4px] shadow-[var(--shadow-book)]" />
      ) : (
        <span className="block w-full max-w-[360px] animate-pulse rounded-[4px] bg-control" style={{ aspectRatio: String(1 / ratio) }} />
      )}
    </figure>
  );
}

function Preview({ study, chapter, title }: { study: PdfStudy; chapter: PdfChapter; title: string }) {
  const opens = chapter.blocks[0]?.kind === "h1" || chapter.blocks[0]?.kind === "h2";
  return (
    <article className="selectable serif mx-auto max-w-[34em] text-[15.5px] leading-[1.6] text-foreground">
      {!opens && <h2 className="mb-5 text-[24px] leading-tight font-medium">{title}</h2>}
      {chapter.blocks.map((block: Block, i) => {
        if (block.kind === "picture") return <PicturePreview key={i} study={study} block={block} />;
        if (block.kind === "h1") return <h2 key={i} className="mt-2 mb-5 text-[26px] leading-tight font-medium"><Runs runs={block.runs} /></h2>;
        if (block.kind === "h2") return <h3 key={i} className="mt-6 mb-3 text-[20px] leading-snug font-medium"><Runs runs={block.runs} /></h3>;
        if (block.kind === "h3") return <h4 key={i} className="mt-5 mb-2 text-[16px] font-semibold"><Runs runs={block.runs} /></h4>;
        if (block.kind === "li")
          return (
            <p key={i} className="relative mb-1.5 pl-5">
              <span className="absolute left-1 text-muted" aria-hidden>•</span>
              <Runs runs={block.runs} />
            </p>
          );
        return <p key={i} className="mb-3 [text-indent:1.4em] first-of-type:[text-indent:0]"><Runs runs={block.runs} /></p>;
      })}
    </article>
  );
}

export function PdfToEpub({ id }: { id: string }) {
  const book = useStore((s) => s.books.find((b) => b.id === id));
  const [study, setStudy] = useState<PdfStudy | null>(null);
  const [reading, setReading] = useState<{ read: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<PdfOptions | null>(null);
  const [edits, setEdits] = useState<ChapterEdits>({ titles: {}, skipped: [] });
  const [selected, setSelected] = useState(0);
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.authors.join(", ") ?? "");
  const [cover, setCover] = useState(Boolean(book?.cover));
  const [making, setMaking] = useState<number | null>(null);

  useEffect(() => {
    if (!book) return;
    let alive = true;
    let read: PdfStudy | null = null;
    (async () => {
      try {
        const file = await fetchFile(book, "pdf");
        read = await studyPdf(await file.arrayBuffer(), (n, of) => alive && setReading({ read: n, of }));
        if (!alive) return closeStudy(read);
        setStudy(read);
        setOptions(startingOptions(read));
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
      closeStudy(read);
    };
    // Read once, for the book it was opened for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const laid = useMemo(() => (study && options ? layOutPdf(study, options) : null), [study, options]);
  if (!book) return null;

  const set = (patch: Partial<PdfOptions>) => {
    setOptions((o) => (o ? { ...o, ...patch } : o));
    setSelected(0);
  };
  const chapters = laid?.chapters ?? [];
  const current = chapters[Math.min(selected, chapters.length - 1)];
  const keys = chapters.map(chapterKey);
  const kept = keys.filter((key) => !edits.skipped.includes(key)).length;
  const pages = study?.pages.length ?? 0;
  const nameOf = (chapter: PdfChapter, key: string) => edits.titles[key] ?? chapter.title;

  const make = async () => {
    if (!study || !laid) return;
    setMaking(0);
    try {
      const base = await baseContent(book);
      base.title = title.trim() || book.title;
      base.authors = author.split(",").map((a) => a.trim()).filter(Boolean);
      if (!cover) delete base.cover;
      const content = await pdfContent(study, laid, edits, base, (share) => setMaking(share * 0.9));
      if (!content.chapters.length) throw new Error(t("There were no words to take out of this file."));
      setMaking(0.95);
      upsert(await api.addFormat(book.id, "epub", buildEpub(content)));
      toast.success(t("{title} is now {format} too", { title: book.title, format: "EPUB" }));
      close();
    } catch (e) {
      toast.error((e as Error).message);
      setMaking(null);
    }
  };

  return (
    <Dialog open onClose={making === null ? close : () => {}} label={t("Make an EPUB from this PDF")} className="sm:max-w-[1080px]">
      <DialogHeader title={t("Make an EPUB from this PDF")} description={t("Check what Shelfed found in it, and change what it got wrong. Nothing changes in the PDF.")} />
      {!laid || !options || !study ? (
        <div className="flex h-[min(60vh,560px)] flex-col items-center justify-center gap-4 border-t border-border px-10">
          {error ? (
            <Alert tone="danger" title={t("Shelfed couldn't read this PDF")}>{error}</Alert>
          ) : (
            <>
              <p className="text-label text-muted">{reading ? t("Reading page {page} of {pages}", { page: String(reading.read), pages: String(reading.of) }) : t("Opening the PDF")}</p>
              <Progress value={reading ? (reading.read / reading.of) * 100 : 0} aria-label={t("Reading the PDF")} className="w-[280px]" />
            </>
          )}
        </div>
      ) : (
        <div className="grid h-[min(64vh,640px)] grid-cols-[330px_1fr] border-t border-border">
          <aside className="scroll flex flex-col gap-5 border-r border-border p-5">
            <section className="flex flex-col gap-1.5">
              <h3 className="text-label font-medium">{tn(chapters.length, "{n} chapter", "{n} chapters")}</h3>
              {chapters.map((chapter, i) => {
                const key = keys[i];
                const skipped = edits.skipped.includes(key);
                return (
                  <div
                    key={key}
                    onClick={() => setSelected(i)}
                    className={cx("flex items-start gap-2 rounded-item px-2 py-1.5", i === selected ? "bg-control" : "hover:bg-control/60", skipped && "opacity-55")}
                  >
                    <span className="pt-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={!skipped}
                        aria-label={t("Keep {title}", { title: nameOf(chapter, key) })}
                        onChange={(keep) => setEdits((ed) => ({ ...ed, skipped: keep ? ed.skipped.filter((k) => k !== key) : [...ed.skipped, key] }))}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <input
                        aria-label={t("Name of chapter {n}", { n: String(i + 1) })}
                        value={nameOf(chapter, key)}
                        onFocus={() => setSelected(i)}
                        onChange={(e) => setEdits((ed) => ({ ...ed, titles: { ...ed.titles, [key]: e.target.value } }))}
                        className="w-full rounded-[6px] bg-transparent px-1 py-0.5 text-label font-medium outline-none focus:bg-card focus:shadow-[0_0_0_1px_var(--line-strong)]"
                      />
                      <span className="block px-1 text-caption text-muted">
                        {chapter.first === chapter.last ? t("Page {page}", { page: String(chapter.first) }) : t("Pages {start} to {end}", { start: String(chapter.first), end: String(chapter.last) })}
                      </span>
                    </span>
                  </div>
                );
              })}
            </section>
            <div className="flex flex-col gap-3">
              <Field label={t("Title")}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label={t("Author")} hint={t("Only the EPUB gets these. The book in your library keeps its own.")}>
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
              </Field>
            </div>

            <section className="flex flex-col gap-3.5">
              <h3 className="text-label font-medium">{t("Tidy up")}</h3>
              <SwitchRow
                label={t("Leave out running heads and page numbers")}
                hint={options.tidy && laid.tidied ? tn(laid.tidied, "{n} line left out", "{n} lines left out") : undefined}
                checked={options.tidy}
                onChange={(tidy) => set({ tidy })}
              />
              <SwitchRow label={t("Join words broken over two lines")} checked={options.join} onChange={(join) => set({ join })} />
              <SwitchRow label={t("Find headings")} hint={t("From bigger type, and bold lines on their own.")} checked={options.headings} onChange={(headings) => set({ headings })} />
              <SwitchRow label={t("Keep pictures")} checked={options.pictures} onChange={(pictures) => set({ pictures })} />
              {book.cover && <SwitchRow label={t("Use the book's cover")} checked={cover} onChange={setCover} />}
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-label font-medium">{t("Chapters")}</h3>
              <Segmented
                label={t("Chapters begin at")}
                size="sm"
                block
                value={options.chapters === "marks" && !laid.marked ? "headings" : options.chapters}
                onChange={(chapters) => set({ chapters })}
                options={[
                  ...(laid.marked ? [{ id: "marks" as const, label: t("Bookmarks") }] : []),
                  { id: "headings" as const, label: t("Headings") },
                  { id: "pages" as const, label: t("Pages") },
                ]}
              />
              {options.chapters === "pages" && (
                <Field label={t("Pages in each")}>
                  <Input type="number" min={1} max={pages} value={options.every} onChange={(e) => set({ every: Math.max(1, Math.min(pages, Number(e.target.value) || 1)) })} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("From page")}>
                  <Input type="number" min={1} max={options.to} value={options.from} onChange={(e) => set({ from: Math.max(1, Math.min(options.to, Number(e.target.value) || 1)) })} />
                </Field>
                <Field label={t("To page")}>
                  <Input type="number" min={options.from} max={pages} value={options.to} onChange={(e) => set({ to: Math.max(options.from, Math.min(pages, Number(e.target.value) || pages)) })} />
                </Field>
              </div>
            </section>

          </aside>

          <section className="scroll bg-well px-10 py-8" aria-label={t("Preview")}>
            {laid.scanned && (
              <div className="mx-auto mb-6 max-w-[34em]">
                <Alert tone="neutral" title={t("These are pictures of pages")}>{t("There are no words in this PDF to reflow, so the EPUB keeps each page as a picture.")}</Alert>
              </div>
            )}
            {current ? (
              <Preview study={study} chapter={current} title={nameOf(current, keys[Math.min(selected, chapters.length - 1)])} />
            ) : (
              <p className="text-center text-label text-muted">{t("No words found on these pages.")}</p>
            )}
          </section>
        </div>
      )}
      <DialogFooter className="sm:items-center">
        {laid && (
          <span className="text-caption text-muted sm:mr-auto">
            {tn(kept, "{n} chapter goes into the EPUB", "{n} chapters go into the EPUB")}
          </span>
        )}
        <Button variant="ghost" onClick={close} disabled={making !== null}>{t("Cancel")}</Button>
        <Button variant="primary" icon={making !== null ? <Spinner size="sm" /> : FileEditIcon} disabled={!laid || !kept || making !== null} onClick={make}>
          {making !== null ? t("Making the EPUB") : t("Make EPUB")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
