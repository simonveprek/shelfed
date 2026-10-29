import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft01Icon, ArrowRight01Icon, Bookmark01Icon, Cancel01Icon, HeadphonesIcon, Menu01Icon, MinusSignIcon, NextIcon, PauseIcon,
  PlayIcon, PlusSignIcon, PreviousIcon, Search01Icon, TextFontIcon,
} from "@hugeicons/core-free-icons";
import type { Annotation, Book, ReaderPrefs } from "../../../shared/types";
import {
  cx, EASE, Icon, IconButton, NavItem, Popover, Segmented, Select, Sheet, Slider, Spinner, Toolbar, ToolbarButton, ToolbarDivider, toast,
} from "@/components/ui";
import { Point } from "@/components/fragms/points";
import { api, isMac, isWin } from "@/lib/api";
import { openReader } from "@/lib/actions";
import { extractContent } from "@/lib/books";
import { defang } from "@/lib/defang";
import { buildEpub } from "@/lib/epub";
import type { PdfDoc } from "@/lib/pdf";
import { flashMood, setSetting, upsert, useStore } from "@/lib/store";
import { addAnnotation, bookmarksOf, newAnnotationId, removeAnnotation } from "@/lib/annotations";
import { AnnotationCard, MARKS, NotesList, SearchPanel, SelectionBar, Tab, useReadingTime, type SearchHit } from "./Notes";
import { authorsOf, debounce, fetchFile, FOLIATE } from "@/lib/util";
import { t, tc } from "../../../shared/i18n";
import { useReadAloud, type Speaking } from "./aloud";

/** The page itself. These are the paper, not the app, so they keep their own colours. Labels are English here and translated where shown. */
const PAPERS: Record<ReaderPrefs["theme"], { bg: string; fg: string; link: string; dark: boolean; label: string }> = {
  light: { bg: "#fbfaf7", fg: "#1d1b18", link: "#2f5fd0", dark: false, label: "Paper" },
  sepia: { bg: "#f2e9d5", fg: "#4f3f2f", link: "#8a4b1f", dark: false, label: "Sepia" },
  dark: { bg: "#1b1b1c", fg: "#d8d6d0", link: "#8fb4ff", dark: true, label: "Dusk" },
  black: { bg: "#000000", fg: "#c9c7c2", link: "#8fb4ff", dark: true, label: "Night" },
};

const FONTS = {
  publisher: "",
  serif: '"Iowan Old Style", "Charter", "Literata", "Sitka Text", Cambria, Georgia, serif',
  sans: '"Geist", -apple-system, "Segoe UI", system-ui, sans-serif',
};

type TocItem = { label: string; href: string; subitems?: TocItem[] };

/** The reader's typography, laid over the book's own styles. */
function bookCss(p: ReaderPrefs) {
  const paper = PAPERS[p.theme];
  const font = FONTS[p.font];
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html { color-scheme: ${paper.dark ? "dark" : "light"}; font-size: ${p.size}px !important; }
    html, body { color: ${paper.fg} !important; background: transparent !important; }
    ${paper.dark || p.theme === "sepia" ? `body *:not(img):not(svg):not(svg *):not(video) { color: inherit !important; background-color: transparent !important; border-color: color-mix(in oklab, currentColor 30%, transparent) !important; }` : ""}
    ${font ? `body, body p, body div, body span, body li, body blockquote, body td, body h1, body h2, body h3, body h4 { font-family: ${font} !important; }` : ""}
    p, li, blockquote, dd {
      line-height: ${p.spacing} !important;
      text-align: ${p.justify ? "justify" : "start"};
      hyphens: ${p.justify ? "auto" : "manual"};
      -webkit-hyphens: ${p.justify ? "auto" : "manual"};
      widows: 2; orphans: 2;
    }
    [align="center"] { text-align: center; }
    [align="right"] { text-align: right; }
    a:any-link { color: ${paper.link} !important; text-underline-offset: 0.15em; }
    pre { white-space: pre-wrap !important; }
    img, svg { max-width: 100%; }
    ${paper.dark ? "img { filter: brightness(0.88); }" : ""}
    ::selection { background: color-mix(in oklab, ${paper.link} 35%, transparent); }
    aside[epub|type~="footnote"], aside[epub|type~="endnote"], aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }
  `;
}

function usePrefs() {
  const prefs = useStore((s) => s.settings.reader);
  const set = useCallback((patch: Partial<ReaderPrefs>) => setSetting({ reader: { ...useStore.getState().settings.reader, ...patch } }), []);
  return [prefs, set] as const;
}

/** Hides the chrome while reading, and brings it back when the pointer moves. */
function useChrome() {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setShown(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShown(false), 2600);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
    };
  }, []);
  return shown;
}

export const saveProgress = debounce(async (id: string, progress: number, location: string, ext: string) => {
  const book = useStore.getState().books.find((b) => b.id === id);
  if (!book) return;
  const finished = progress >= 0.995 && book.status !== "finished";
  const patch = { progress, location, readFormat: ext, ...(finished ? { status: "finished" as const } : {}) };
  upsert({ ...book, ...patch });
  await api.update(id, patch);
  if (finished) {
    flashMood("excited", 3000);
    toast.success(t("Finished {title}", { title: book.title }), { description: t("Marked as read") });
  }
}, 700);

/* ------------------------------------------------------------------------ */
/* Chrome shared by both readers                                             */
/* ------------------------------------------------------------------------ */

function TypeSettings({ prefs, set, pdf }: { prefs: ReaderPrefs; set: (p: Partial<ReaderPrefs>) => void; pdf?: boolean }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(PAPERS) as Array<ReaderPrefs["theme"]>).map((key) => (
          <button key={key} onClick={() => set({ theme: key })} className="flex flex-col items-center gap-1.5">
            <span
              className={cx(
                "serif flex h-11 w-full items-center justify-center rounded-item text-[15px] font-medium transition-shadow duration-150",
                prefs.theme === key ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-[inset_0_0_0_1px_var(--line-strong)]",
              )}
              style={{ background: PAPERS[key].bg, color: PAPERS[key].fg }}
            >
              Aa
            </span>
            <span className="text-caption text-muted">{tc("page", PAPERS[key].label)}</span>
          </button>
        ))}
      </div>
      {!pdf && (
        <>
          <Slider label={t("Text size")} dense value={prefs.size} min={12} max={34} step={1} digits={0} suffix=" pt" defaultValue={18} onChange={(size) => set({ size })} />
          <Slider label={t("Line spacing")} dense value={prefs.spacing} min={1.1} max={2.2} step={0.05} digits={2} defaultValue={1.5} onChange={(spacing) => set({ spacing })} />
          <Slider label={t("Line length")} dense value={prefs.width} min={460} max={1000} step={20} format={(v) => t("{n} ch", { n: Math.round(v / 9.5) })} defaultValue={680} onChange={(width) => set({ width })} />
          <Segmented label={t("Typeface")} size="sm" block value={prefs.font} onChange={(font) => set({ font })} options={[{ id: "publisher", label: t("The book’s") }, { id: "serif", label: t("Serif") }, { id: "sans", label: t("Sans") }]} />
          <div className="flex gap-2">
            <Segmented label={t("Page turns")} size="sm" block className="flex-1" value={prefs.flow} onChange={(flow) => set({ flow })} options={[{ id: "paginated", label: t("Pages") }, { id: "scrolled", label: t("Scroll") }]} />
            <Segmented label={t("Alignment")} size="sm" value={prefs.justify ? "j" : "l"} onChange={(v) => set({ justify: v === "j" })} options={[{ id: "l", label: t("Left") }, { id: "j", label: t("Justify") }]} />
          </div>
        </>
      )}
    </div>
  );
}

function Contents({ items, current, onGo }: { items: TocItem[]; current?: string; onGo: (href: string) => void }) {
  const glide = useId();
  const flat: Array<TocItem & { depth: number }> = [];
  const walk = (list: TocItem[], depth: number) => list.forEach((item) => {
    flat.push({ ...item, depth });
    if (item.subitems?.length) walk(item.subitems, depth + 1);
  });
  walk(items, 0);
  return (
    <div className="flex flex-col gap-0.5">
      {flat.map((item, i) => (
        <div key={item.href + i} style={{ paddingLeft: item.depth * 14 }}>
          <NavItem glide={glide} active={item.href === current} onClick={() => onGo(item.href)} className="w-full">
            <span className="line-clamp-2">{item.label.trim()}</span>
          </NavItem>
        </div>
      ))}
    </div>
  );
}

export type Panel = "contents" | "notes" | "search";

function Frame({
  book, prefs, setPrefs, toc, current, onGo, footer, children, pdf, loading, error, onPrev, onNext,
  panel, setPanel, notes, search, bookmarked, onBookmark, overlay, aloud,
}: {
  book: Book;
  prefs: ReaderPrefs;
  setPrefs: (p: Partial<ReaderPrefs>) => void;
  toc: TocItem[];
  current?: string;
  onGo: (href: string) => void;
  footer: ReactNode;
  children: ReactNode;
  pdf?: boolean;
  loading: boolean;
  error: string | null;
  onPrev?: () => void;
  onNext?: () => void;
  /** The side panel, open on contents, notes or search. */
  panel: Panel | null;
  setPanel: (panel: Panel | null) => void;
  notes: ReactNode;
  search?: ReactNode;
  bookmarked?: boolean;
  onBookmark?: () => void;
  /** Floating things over the page, like the bar over selected words. */
  overlay?: ReactNode;
  /** Reading aloud: whether it's going, and the button that starts and stops it. */
  aloud?: { on: boolean; toggle: () => void };
}) {
  const paper = PAPERS[prefs.theme];
  const chrome = useChrome();
  const contents = panel !== null;
  const close = () => useStore.setState({ reading: null });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || contents || document.querySelector("[role=dialog]")) return;
      close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [contents]);

  // The window's own bar takes the page's colour while reading.
  useEffect(() => {
    api.appearance(paper.dark, paper.bg, paper.fg);
    return () => {
      const dark = document.documentElement.classList.contains("dark");
      api.appearance(dark);
    };
  }, [paper]);

  const visible = chrome || contents;

  return (
    <motion.div
      className={cx("fixed inset-0 z-[45] flex flex-col", paper.dark && "dark")}
      style={{ background: paper.bg, color: paper.fg, colorScheme: paper.dark ? "dark" : "light" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE } }}
      exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
    >
      <div className={cx("drag relative z-20 flex h-16 shrink-0 items-center justify-center", isMac ? "pl-20" : "pl-4", isWin ? "pr-[150px]" : "pr-4")}>
        <motion.div animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : -6 }} transition={{ duration: visible ? 0.25 : 0.15, ease: EASE }} className="no-drag">
          <Toolbar label={t("Reader")}>
            <ToolbarButton label={t("Back to the library")} icon={ArrowLeft01Icon} onClick={close}>{t("Library")}</ToolbarButton>
            <ToolbarButton label={t("Contents and notes")} icon={Menu01Icon} onClick={() => setPanel(toc.length ? "contents" : "notes")} />
            {search && <ToolbarButton label={t("Search in this book")} icon={Search01Icon} onClick={() => setPanel("search")} />}
            <ToolbarDivider />
            <span className="max-w-[34vw] truncate px-2 text-label">
              <span className="font-medium">{book.title}</span>
              <span className="text-muted">, {authorsOf(book)}</span>
            </span>
            <ToolbarDivider />
            {aloud && (
              <ToolbarButton
                label={aloud.on ? t("Stop reading aloud") : t("Read aloud")}
                icon={HeadphonesIcon}
                onClick={aloud.toggle}
                className={aloud.on ? "text-accent" : undefined}
              />
            )}
            {onBookmark && (
              <ToolbarButton
                label={bookmarked ? t("Remove bookmark") : t("Bookmark this page")}
                icon={Bookmark01Icon}
                onClick={onBookmark}
                className={bookmarked ? "[&_path]:fill-current" : undefined}
              />
            )}
            <Popover label={t("Text and page")} align="end" width={300} trigger={({ props }) => <ToolbarButton {...props} label={t("Text and page")} icon={TextFontIcon} />}>
              <TypeSettings prefs={prefs} set={setPrefs} pdf={pdf} />
            </Popover>
          </Toolbar>
        </motion.div>
      </div>

      <div className="relative min-h-0 flex-1">
        {children}
        {onPrev && onNext && !loading && !error && (
          <>
            <PageButton side="left" onClick={onPrev} />
            <PageButton side="right" onClick={onNext} />
          </>
        )}
        <AnimatePresence>
          {(loading || error) && (
            <motion.div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5" style={{ background: paper.bg }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
              {error ? <Point shape="squircle" mood="sad" size={64} /> : <Spinner size="lg" />}
              <p className="max-w-[360px] text-center text-label opacity-60">{error ?? t("Opening the book")}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.footer
        className="relative z-20 mx-auto w-full max-w-[720px] shrink-0 px-6 pt-1 pb-4"
        animate={{ opacity: visible ? 1 : 0.0001 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        {footer}
      </motion.footer>

      {overlay}

      <Sheet open={contents} onClose={() => setPanel(null)} side="left" title={book.title} description={authorsOf(book)}>
        <div className="-mt-1 mb-4 flex gap-1">
          {toc.length > 0 && <Tab active={panel === "contents"} onClick={() => setPanel("contents")}>{t("Contents")}</Tab>}
          <Tab active={panel === "notes"} onClick={() => setPanel("notes")}>{t("Notes")}</Tab>
          {search && <Tab active={panel === "search"} onClick={() => setPanel("search")}>{t("Search")}</Tab>}
        </div>
        {panel === "contents" && (
          <Contents
            items={toc}
            current={current}
            onGo={(href) => {
              onGo(href);
              setPanel(null);
            }}
          />
        )}
        {panel === "notes" && notes}
        {panel === "search" && search}
      </Sheet>
    </motion.div>
  );
}

function PageButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? t("Previous page") : t("Next page")}
      className={cx("group absolute inset-y-0 z-10 flex w-[6%] min-w-12 items-center", side === "left" ? "left-0 justify-start pl-4" : "right-0 justify-end pr-4")}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-control opacity-0 transition-opacity duration-150 group-hover:opacity-80">
        <Icon icon={side === "left" ? ArrowLeft01Icon : ArrowRight01Icon} size={18} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/* E-books, through foliate                                                  */
/* ------------------------------------------------------------------------ */

type FoliateView = HTMLElement & {
  open: (file: File) => Promise<void>;
  init: (opts: { lastLocation?: string; showTextStart?: boolean }) => Promise<void>;
  close: () => void;
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  prev: () => Promise<void>;
  next: () => Promise<void>;
  goTo: (target: string) => Promise<unknown>;
  goToFraction: (f: number) => Promise<void>;
  getCFI: (index: number, range?: Range) => string;
  resolveCFI: (cfi: string) => { index: number; anchor: (doc: Document) => Range | Node };
  addAnnotation: (a: { value: string; color?: string }, remove?: boolean) => Promise<{ index: number; label: string } | undefined>;
  deleteAnnotation: (a: { value: string }) => Promise<unknown>;
  search: (opts: { query: string }) => AsyncGenerator<any>;
  clearSearch: () => void;
  book: { toc?: TocItem[]; transformTarget?: EventTarget };
  renderer: HTMLElement & { setStyles?: (css: string) => void };
};

function applyLayout(view: FoliateView, prefs: ReaderPrefs) {
  const r = view.renderer;
  r.setAttribute("flow", prefs.flow);
  r.setAttribute("max-inline-size", `${prefs.width}px`);
  r.setAttribute("max-column-count", prefs.flow === "paginated" ? "2" : "1");
  r.setAttribute("gap", "7%");
  r.setAttribute("margin", "32px");
  r.setStyles?.(bookCss(prefs));
}

type Picked = { index: number; range: Range; text: string; x: number; y: number };

/** Where a range sits on screen, through the frame of the page it is in. */
function screenRect(range: Range) {
  const rect = range.getBoundingClientRect();
  const frame = (range.startContainer.ownerDocument?.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect();
  return { x: (frame?.left ?? 0) + rect.left + rect.width / 2, top: (frame?.top ?? 0) + rect.top, bottom: (frame?.top ?? 0) + rect.bottom };
}

const SPEEDS = [0.8, 1, 1.2, 1.5, 2];

/** The bar while reading aloud: a paragraph back, play or pause, a paragraph on, speed, voice, stop. */
function AloudBar({ aloud, prefs, setPrefs }: { aloud: ReturnType<typeof useReadAloud>; prefs: ReaderPrefs; setPrefs: (p: Partial<ReaderPrefs>) => void }) {
  const voice = aloud.voices.find((v) => v.voiceURI === prefs.voice) ?? aloud.voices[0];
  return (
    <motion.div
      className="absolute bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/95 py-1.5 pr-2 pl-1.5 shadow-float backdrop-blur-xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      <IconButton label={t("A paragraph back")} icon={PreviousIcon} onClick={() => aloud.skip(-1)} />
      <IconButton label={aloud.playing ? t("Pause") : t("Read on")} icon={aloud.playing ? PauseIcon : PlayIcon} onClick={aloud.playing ? aloud.pause : aloud.play} />
      <IconButton label={t("A paragraph on")} icon={NextIcon} onClick={() => aloud.skip(1)} />
      <span className="mx-1 h-5 w-px bg-border" />
      <Select
        label={t("Speed")}
        size="sm"
        value={String(prefs.rate ?? 1)}
        onChange={(v) => setPrefs({ rate: Number(v) })}
        options={SPEEDS.map((x) => ({ id: String(x), label: `${x.toLocaleString()}×` }))}
      />
      {aloud.voices.length > 1 && (
        <Select
          label={t("Voice")}
          size="sm"
          value={voice?.voiceURI ?? ""}
          onChange={(id) => setPrefs({ voice: id })}
          options={aloud.voices.map((v) => ({ id: v.voiceURI, label: v.name }))}
        />
      )}
      <IconButton label={t("Stop reading aloud")} icon={Cancel01Icon} onClick={aloud.stop} />
    </motion.div>
  );
}

function BookReader({ book, ext }: { book: Book; ext: string }) {
  const [prefs, setPrefs] = usePrefs();
  const live = useStore((s) => s.books.find((b) => b.id === book.id)) ?? book;
  const annotations = useRef<Annotation[]>(live.annotations ?? []);
  annotations.current = live.annotations ?? [];
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<FoliateView | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [where, setWhere] = useState<{ fraction: number; chapter?: string; href?: string; cfi?: string }>({ fraction: book.progress ?? 0 });
  const [drag, setDrag] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  // The words on screen right now, to tell whether a bookmark is on this page.
  const [shownRange, setShownRange] = useState<{ index: number; range: Range } | null>(null);
  // Where the page is, for reading aloud from there.
  const here = useRef<Range | null>(null);
  const aloud = useReadAloud(view as unknown as React.RefObject<Speaking | null>, here, {
    lang: book.language ?? "en",
    voice: prefs.voice,
    rate: prefs.rate ?? 1,
  });
  const [open, setOpen] = useState<{ id: string; x: number; y: number } | null>(null);
  const touch = useReadingTime(book.id);

  const onKey = useCallback((e: KeyboardEvent) => {
    const v = view.current;
    if (!v || document.querySelector("[role=dialog]") || (e.target as HTMLElement)?.closest?.("input, textarea")) return;
    touch();
    if (e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) v.goLeft();
    else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault();
      v.goRight();
    } else if (e.key === "Escape" && e.currentTarget !== window) {
      // Escape inside the book's page is passed up to the window, which closes the book.
      // Not one already on the window: this listens there too, and would pass it on forever.
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }
  }, [touch]);

  // Trackpads turn pages too, one page per swipe.
  const wheelLock = useRef(0);
  const onWheel = useCallback((e: WheelEvent) => {
    const v = view.current;
    touch();
    if (!v || useStore.getState().settings.reader.flow === "scrolled") return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 18 || Date.now() < wheelLock.current) return;
    wheelLock.current = Date.now() + 450;
    if (d > 0) v.next();
    else v.prev();
  }, [touch]);

  // Opens once per book. Typography changes restyle without reopening.
  useEffect(() => {
    let alive = true;
    let el: FoliateView | null = null;
    (async () => {
      try {
        await import("foliate-js/view.js");
        const { Overlayer } = await import("foliate-js/overlayer.js");
        let file: File;
        if (FOLIATE.includes(ext)) file = await fetchFile(book, ext);
        else {
          // Text, Markdown, web pages and Word open as an EPUB made on the spot.
          const content = await extractContent(book, ext);
          file = new File([buildEpub(content) as BlobPart], "book.epub", { type: "application/epub+zip" });
        }
        if (!alive) return;
        el = document.createElement("foliate-view") as FoliateView;
        el.style.cssText = "display:block;width:100%;height:100%";
        host.current!.append(el);
        await el.open(file);
        if (!alive) return;
        view.current = el;
        if (import.meta.env.DEV) Object.assign(window, { __view: el });
        el.book.transformTarget?.addEventListener("data", (e: Event) => {
          const detail = (e as CustomEvent).detail;
          const markup = /html|xml|svg/.test(String(detail.type));
          detail.data = Promise.resolve(detail.data)
            .then((data) => (markup && typeof data === "string" ? defang(data) : data))
            .catch(() => "");
        });
        applyLayout(el, useStore.getState().settings.reader);
        el.addEventListener("relocate", (e: Event) => {
          const d = (e as CustomEvent).detail;
          setWhere({ fraction: d.fraction ?? 0, chapter: d.tocItem?.label?.trim(), href: d.tocItem?.href, cfi: d.cfi });
          if (d.range && d.section) setShownRange({ index: d.section.current, range: d.range });
          if (d.range) here.current = d.range;
          setPicked(null);
          touch();
          if (d.cfi) saveProgress(book.id, d.fraction ?? 0, d.cfi, ext);
        });
        // Highlights are drawn as each part of the book loads.
        el.addEventListener("create-overlay", (e: Event) => {
          const { index } = (e as CustomEvent).detail;
          for (const a of annotations.current)
            if (a.kind === "highlight" && a.cfi && a.index === index && (!a.ext || a.ext === ext)) el?.addAnnotation({ value: a.cfi, color: a.color });
        });
        el.addEventListener("draw-annotation", (e: Event) => {
          const { draw, annotation } = (e as CustomEvent).detail;
          draw(Overlayer.highlight, { color: MARKS[(annotation.color as keyof typeof MARKS) ?? "yellow"] });
        });
        el.addEventListener("show-annotation", (e: Event) => {
          const { value, range } = (e as CustomEvent).detail;
          const a = annotations.current.find((x) => x.cfi === value);
          if (!a || !range) return;
          const r = screenRect(range);
          setOpen({ id: a.id, x: r.x, y: r.bottom });
        });
        el.addEventListener("load", (e: Event) => {
          const { doc, index } = (e as CustomEvent).detail as { doc: Document; index: number };
          doc.addEventListener("keydown", onKey);
          doc.addEventListener("wheel", onWheel, { passive: true });
          // Selecting words offers to highlight them.
          doc.addEventListener("pointerup", () =>
            setTimeout(() => {
              const sel = doc.getSelection();
              const text = sel?.toString().trim();
              if (!sel || sel.isCollapsed || !text) return;
              const range = sel.getRangeAt(0);
              const r = screenRect(range);
              setPicked({ index, range, text, x: r.x, y: r.top });
            }, 10),
          );
          doc.addEventListener("selectionchange", () => {
            if (doc.getSelection()?.isCollapsed) setPicked(null);
          });
        });
        setToc(el.book.toc ?? []);
        const place = !book.readFormat || book.readFormat === ext ? book.location : undefined;
        try {
          await el.init({ lastLocation: place, showTextStart: !place });
        } catch {
          // A place that no longer fits the file opens the book at its start instead.
          await el.init({ showTextStart: true });
        }
        setLoading(false);
      } catch (err) {
        if (alive) setError(t("This {format} could not be opened. {error}", { format: ext.toUpperCase(), error: (err as Error).message ?? "" }).trim());
      }
    })();
    return () => {
      alive = false;
      el?.close();
      el?.remove();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, ext]);

  useEffect(() => {
    if (view.current) applyLayout(view.current, prefs);
  }, [prefs]);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  const highlight = async (color: NonNullable<Annotation["color"]>, note = false) => {
    const v = view.current;
    if (!v || !picked) return;
    const cfi = v.getCFI(picked.index, picked.range);
    const placed = await v.addAnnotation({ value: cfi, color });
    const annotation: Annotation = {
      id: newAnnotationId(),
      kind: "highlight",
      cfi,
      index: picked.index,
      text: picked.text.replace(/\s+/g, " ").slice(0, 2000),
      color,
      chapter: placed?.label || where.chapter,
      fraction: where.fraction,
      ext,
      created: Date.now(),
    };
    addAnnotation(book.id, annotation);
    picked.range.startContainer.ownerDocument?.getSelection()?.removeAllRanges();
    if (note) setOpen({ id: annotation.id, x: picked.x, y: picked.y + 24 });
    setPicked(null);
  };

  // A highlight's colour or removal shows on the page at once.
  const shown = useRef(new Map<string, string | undefined>());
  useEffect(() => {
    const v = view.current;
    if (!v || loading) return;
    const now = new Map((live.annotations ?? []).filter((a) => a.kind === "highlight" && a.cfi && (!a.ext || a.ext === ext)).map((a) => [a.cfi!, a.color]));
    for (const [cfi, color] of now) if (shown.current.has(cfi) && shown.current.get(cfi) !== color) v.addAnnotation({ value: cfi, color });
    for (const cfi of shown.current.keys()) if (!now.has(cfi)) v.deleteAnnotation({ value: cfi });
    shown.current = now;
  }, [live.annotations, loading]);

  // A bookmark keeps the place where its page began. It is on this page when
  // that place is among the words shown, however the text has been laid out since.
  const bookmark = bookmarksOf(live).find((b) => {
    const v = view.current;
    if (!v || !b.cfi || !shownRange || (b.ext && b.ext !== ext)) return false;
    try {
      const { index, anchor } = v.resolveCFI(b.cfi);
      if (index !== shownRange.index) return false;
      const at = anchor(shownRange.range.startContainer.ownerDocument!);
      // The range comes from the page's own frame, so it is checked by shape, not by instanceof.
      return "startContainer" in at ? shownRange.range.isPointInRange(at.startContainer, at.startOffset) : shownRange.range.intersectsNode(at);
    } catch {
      return false;
    }
  });

  const runSearch = async (query: string, found: (hits: SearchHit[]) => void, progress: (n: number) => void, signal: { stop: boolean }) => {
    const v = view.current;
    if (!v) return;
    for await (const result of v.search({ query })) {
      if (signal.stop) break;
      if (result === "done") break;
      if (result.progress !== undefined) progress(result.progress);
      if (result.subitems)
        found(
          result.subitems.map((item: { cfi: string; excerpt: { pre: string; match: string; post: string } }) => ({
            key: item.cfi,
            label: result.label || "",
            ...item.excerpt,
            go: () => {
              v.goTo(item.cfi);
              setPanel(null);
            },
          })),
        );
    }
  };
  useEffect(() => {
    if (panel !== "search") view.current?.clearSearch();
  }, [panel]);

  const jump = useMemo(() => debounce((f: number) => {
    view.current?.goToFraction(f);
    setDrag(null);
  }, 160), []);
  const fraction = drag ?? where.fraction;
  const opened = open && (live.annotations ?? []).find((a) => a.id === open.id);

  return (
    <Frame
      book={book}
      prefs={prefs}
      setPrefs={setPrefs}
      toc={toc}
      current={where.href}
      onGo={(href) => view.current?.goTo(href)}
      loading={loading}
      error={error}
      onPrev={prefs.flow === "paginated" ? () => view.current?.goLeft() : undefined}
      onNext={prefs.flow === "paginated" ? () => view.current?.goRight() : undefined}
      panel={panel}
      setPanel={setPanel}
      aloud={aloud.available ? { on: aloud.active, toggle: () => (aloud.active ? aloud.stop() : aloud.play()) } : undefined}
      bookmarked={Boolean(bookmark)}
      onBookmark={() =>
        bookmark
          ? removeAnnotation(book.id, bookmark.id)
          : where.cfi &&
            addAnnotation(book.id, { id: newAnnotationId(), kind: "bookmark", cfi: where.cfi, chapter: where.chapter, fraction: where.fraction, ext, created: Date.now() })
      }
      notes={
        <NotesList
          book={live}
          onGo={(a) => {
            setPanel(null);
            // A mark made in another of the book's files opens that file.
            if (a.ext && a.ext !== ext) return openReader(book.id, a.ext);
            if (a.cfi) view.current?.goTo(a.cfi);
          }}
          onFind={(text) => {
            // A Kindle highlight has no place here, so its first words are looked for instead.
            setFind(text.split(/\s+/).slice(0, 8).join(" "));
            setPanel("search");
          }}
        />
      }
      search={<SearchPanel key={find} query={find} run={runSearch} />}
      overlay={
        <AnimatePresence>
          {picked && !open && (
            <SelectionBar
              key="bar"
              x={picked.x}
              y={picked.y}
              onHighlight={(c) => highlight(c)}
              onNote={() => highlight("yellow", true)}
              onCopy={() => {
                navigator.clipboard.writeText(picked.text);
                toast.success(t("Copied"));
                setPicked(null);
              }}
            />
          )}
          {opened && open && <AnnotationCard key={open.id} annotation={opened} bookId={book.id} x={open.x} y={open.y} onClose={() => setOpen(null)} />}
          {aloud.active && <AloudBar key="aloud" aloud={aloud} prefs={prefs} setPrefs={setPrefs} />}
        </AnimatePresence>
      }
      footer={
        <Slider
          label={where.chapter ?? t("Progress")}
          dense
          value={Math.round(fraction * 1000) / 10}
          min={0}
          max={100}
          step={0.1}
          digits={0}
          suffix="%"
          onChange={(v) => {
            setDrag(v / 100);
            jump(v / 100);
          }}
        />
      }
    >
      <div ref={host} className="absolute inset-0" />
    </Frame>
  );
}

/* ------------------------------------------------------------------------ */
/* PDFs, through pdf.js, as a long scroll of pages                           */
/* ------------------------------------------------------------------------ */

function PdfPage({ doc, n, width, dark, onVisible }: { doc: PdfDoc; n: number; width: number; dark: boolean; onVisible: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.414);
  const [near, setNear] = useState(false);
  const drawn = useRef(0);

  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: "1200px 0px" });
    const seen = new IntersectionObserver(([entry]) => entry.isIntersecting && onVisible(n), { threshold: 0.5 });
    io.observe(el);
    seen.observe(el);
    return () => {
      io.disconnect();
      seen.disconnect();
    };
  }, [n, onVisible]);

  useEffect(() => {
    if (!near || drawn.current === width) return;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let alive = true;
    (async () => {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      if (!alive) return;
      setRatio(base.height / base.width);
      const viewport = page.getViewport({ scale: (width / base.width) * Math.min(window.devicePixelRatio || 1, 2.5) });
      const c = canvas.current!;
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      task = page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport });
      await task.promise.catch(() => {});
      drawn.current = width;
    })();
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [near, width, doc, n]);

  return (
    <div ref={ref} data-page={n} className="relative mx-auto mb-4 overflow-hidden rounded-[3px] bg-white shadow-[var(--shadow-book)]" style={{ width, height: width * ratio }}>
      <canvas ref={canvas} className="block size-full" style={dark ? { filter: "invert(0.9) hue-rotate(180deg)" } : undefined} />
    </div>
  );
}

function PdfReader({ book }: { book: Book }) {
  const [prefs, setPrefs] = usePrefs();
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A saved page only counts when it was saved in this PDF.
  const savedPage = !book.readFormat || book.readFormat === "pdf" ? Number(book.location) || 1 : 1;
  const [page, setPage] = useState(savedPage);
  const [zoom, setZoom] = useState(1);
  const [outline, setOutline] = useState<TocItem[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const restored = useRef(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [find, setFind] = useState("");
  const live = useStore((s) => s.books.find((b) => b.id === book.id)) ?? book;
  useReadingTime(book.id);

  useEffect(() => {
    let alive = true;
    let opened: PdfDoc | null = null;
    (async () => {
      try {
        const { openPdf, closePdf } = await import("@/lib/pdf");
        const file = await fetchFile(book, "pdf");
        opened = await openPdf(await file.arrayBuffer());
        if (!alive) return closePdf(opened);
        setDoc(opened);
        const items = (await opened.getOutline().catch(() => null)) ?? [];
        const map = async (list: typeof items): Promise<TocItem[]> =>
          Promise.all(
            list.map(async (item) => {
              let n = 1;
              try {
                const dest = typeof item.dest === "string" ? await opened!.getDestination(item.dest) : item.dest;
                if (dest?.[0]) n = (await opened!.getPageIndex(dest[0])) + 1;
              } catch {
                // An outline entry without a page still shows.
              }
              return { label: item.title, href: String(n), subitems: item.items?.length ? await map(item.items) : undefined };
            }),
          );
        setOutline(await map(items));
      } catch (err) {
        if (alive) setError(t("This PDF could not be opened. {error}", { error: (err as Error).message ?? "" }).trim());
      }
    })();
    return () => {
      alive = false;
      if (opened) import("@/lib/pdf").then(({ closePdf }) => closePdf(opened));
    };
  }, [book]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.min(e.contentRect.width - 64, 900)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  const goTo = useCallback((n: number) => scroller.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: "start" }), []);

  // Back to the page last read, once the pages have their places.
  useEffect(() => {
    if (doc && !restored.current) {
      restored.current = true;
      requestAnimationFrame(() => goTo(Math.min(savedPage, doc.numPages)));
    }
  }, [doc, goTo, savedPage]);

  const onVisible = useCallback(
    (n: number) => {
      setPage(n);
      if (doc && restored.current) saveProgress(book.id, n / doc.numPages, String(n), "pdf");
    },
    [doc, book.id],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]")) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) setZoom((z) => Math.min(3, z + 0.15));
      else if ((e.metaKey || e.ctrlKey) && e.key === "-") setZoom((z) => Math.max(0.5, z - 0.15));
      else if (e.key === "ArrowRight" || e.key === "PageDown") doc && goTo(Math.min(doc.numPages, page + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(Math.max(1, page - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [doc, page, goTo]);

  const pages = useMemo(() => (doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : []), [doc]);
  const dark = PAPERS[prefs.theme].dark;
  const bookmark = bookmarksOf(live).find((b) => (!b.ext || b.ext === "pdf") && b.cfi === String(page));

  // Looks through the words of each page in turn, from pdf.js's text.
  const runSearch = async (query: string, found: (hits: SearchHit[]) => void, progress: (n: number) => void, signal: { stop: boolean }) => {
    if (!doc) return;
    const needle = query.toLowerCase();
    for (let n = 1; n <= doc.numPages && !signal.stop; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const text = content.items.map((i) => ("str" in i ? i.str : "")).join(" ").replace(/\s+/g, " ");
      const lower = text.toLowerCase();
      const hits: SearchHit[] = [];
      for (let at = lower.indexOf(needle); at !== -1 && hits.length < 20; at = lower.indexOf(needle, at + needle.length)) {
        hits.push({
          key: `${n}-${at}`,
          label: t("Page {page}", { page: String(n) }),
          pre: text.slice(Math.max(0, at - 50), at),
          match: text.slice(at, at + needle.length),
          post: text.slice(at + needle.length, at + needle.length + 50),
          go: () => {
            goTo(n);
            setPanel(null);
          },
        });
      }
      if (hits.length) found(hits);
      progress(n / doc.numPages);
    }
  };

  return (
    <Frame
      book={book}
      prefs={prefs}
      setPrefs={setPrefs}
      pdf
      toc={outline}
      onGo={(href) => goTo(Number(href))}
      loading={!doc && !error}
      error={error}
      panel={panel}
      setPanel={setPanel}
      bookmarked={Boolean(bookmark)}
      onBookmark={() =>
        bookmark
          ? removeAnnotation(book.id, bookmark.id)
          : addAnnotation(book.id, { id: newAnnotationId(), kind: "bookmark", cfi: String(page), chapter: `Page ${page}`, ext: "pdf", created: Date.now() })
      }
      notes={
        <NotesList
          book={live}
          onGo={(a) => {
            setPanel(null);
            if (a.ext && a.ext !== "pdf") return openReader(book.id, a.ext);
            if (a.cfi) goTo(Number(a.cfi));
          }}
          onFind={(text) => {
            setFind(text.split(/\s+/).slice(0, 6).join(" "));
            setPanel("search");
          }}
        />
      }
      search={<SearchPanel key={find} query={find} run={runSearch} />}
      footer={
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Slider label={t("Page {page} of {pages}", { page: String(page), pages: String(doc?.numPages ?? 1) })} dense value={page} min={1} max={Math.max(2, doc?.numPages ?? 1)} step={1} digits={0} onChange={(n) => goTo(Math.round(n))} />
          </div>
          <Toolbar label={t("Zoom")} className="shadow-none">
            <ToolbarButton label={t("Zoom out")} icon={MinusSignIcon} onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} />
            <span className="w-11 text-center text-caption tabular-nums">{Math.round(zoom * 100)}%</span>
            <ToolbarButton label={t("Zoom in")} icon={PlusSignIcon} onClick={() => setZoom((z) => Math.min(3, z + 0.15))} />
          </Toolbar>
        </div>
      }
    >
      <div ref={scroller} className="scroll absolute inset-0 pt-2">
        {doc && pages.map((n) => <PdfPage key={n} doc={doc} n={n} width={Math.round(width * zoom)} dark={dark} onVisible={onVisible} />)}
      </div>
    </Frame>
  );
}

export function Reader() {
  const reading = useStore((s) => s.reading);
  const book = useStore((s) => (reading ? s.books.find((b) => b.id === reading.id) : undefined));
  // The book is held once opened, so saving progress never reopens it.
  const [held, setHeld] = useState<Book | null>(null);
  useEffect(() => {
    if (!reading) setHeld(null);
    else if (book && held?.id !== book.id) setHeld(book);
  }, [reading, book, held]);

  return (
    <AnimatePresence>
      {reading && held && (reading.ext === "pdf" ? <PdfReader key={held.id + reading.ext} book={held} /> : <BookReader key={held.id + reading.ext} book={held} ext={reading.ext} />)}
    </AnimatePresence>
  );
}
