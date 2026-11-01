import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, type MotionValue } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Book, BookcasePrefs } from "../../../shared/types";
import { EASE } from "@/components/ui";
import { openReader } from "@/lib/actions";
import { selectBook, targetIds } from "@/lib/select";
import { useStore, type Section } from "@/lib/store";
import { facesToShow } from "@/lib/shelf-faces";
import { boxSets, rainbowOrder, readingPile, standTogether } from "@/lib/shelf-order";
import { spineOf } from "@/lib/spine";
import { authorsOf, bestFormat, hashString, sortAuthor } from "@/lib/util";
import { ribbonColour } from "./Colours";
import { Cover } from "./Cover";
import { BooksMenu, dragBooks, useKeys } from "./Library";
import { t } from "../../../shared/i18n";

/*
 * The bookcase. Every book stands spine out on a shelf, in real 3D made of
 * CSS planes. Pointing lifts a book a little, picking one pulls it out and
 * turns it to show its cover, and the whole case leans with the pointer.
 * Shelves can be given to each author, series, collection, reading status or
 * format, and the case can be made of paper, oak, walnut or slate.
 *
 * Every 3D plane is a layer the graphics card has to keep, and they add up
 * fast, so a shelf only builds what can be seen. All its spines stand level, so
 * they're drawn together on one plane. A book at rest adds its top and whichever
 * side shows past its neighbours, and only the book being touched is whole.
 */

type Size = { w: number; h: number; d: number };

/** A book's size on the shelf. Thicker files make thicker books, the title picks its height. */
function sizeOf(book: Book, scale: number, sets?: ReadonlySet<string>): Size {
  const hash = hashString(book.title + book.id);
  const bytes = Math.max(...book.formats.map((f) => f.size), 1);
  const thick = Math.min(44, Math.max(18, 15 + Math.log2(Math.max(bytes, 80_000) / 80_000) * 4.2 + ((hash >> 3) % 5)));
  // The books of a set are all the one height, as a publisher would bind them.
  const inSet = book.series && sets?.has(book.series);
  const h = 156 + ((inSet ? hashString(book.series!) : hash) % 32);
  return { w: Math.round(thick * scale), h: Math.round(h * scale), d: Math.round(h * 0.7 * scale) };
}

/* ------------------------------------------------------------------------ */
/* What the case is made of                                                  */
/* ------------------------------------------------------------------------ */

const grain = (wood: string) =>
  `repeating-linear-gradient(90deg, rgb(0 0 0 / 0.045) 0 1px, transparent 1px 6px, rgb(255 255 255 / 0.03) 6px 7px, transparent 7px 13px), linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(0 0 0 / 0.1)), ${wood}`;

type Material = { back: string; top: string; front: string; edge: string };

export const MATERIALS: Record<BookcasePrefs["material"], Material & { label: string }> = {
  paper: { label: "Paper", back: "var(--well)", top: "var(--tile)", front: "var(--card)", edge: "var(--border)" },
  oak: { label: "Oak", back: grain("#e6d6bc"), top: grain("#cba06a"), front: grain("#b5884f"), edge: "rgb(90 55 20 / 0.25)" },
  walnut: { label: "Walnut", back: grain("#2e231c"), top: grain("#6e4c33"), front: grain("#5b3d29"), edge: "rgb(0 0 0 / 0.4)" },
  slate: { label: "Slate", back: "#1d1f22", top: "#3a3e44", front: "#2c3035", edge: "rgb(255 255 255 / 0.07)" },
};

/* ------------------------------------------------------------------------ */
/* Shelves by author, series, collection, status or format                   */
/* ------------------------------------------------------------------------ */

type Group = { key: string; label: string; go?: Section; books: Book[] };

const STATUS_ORDER = { reading: 0, unread: 1, finished: 2 } as const;
const STATUS_LABEL = { reading: "Reading", unread: "Want to read", finished: "Finished" } as const;

function groupBooks(books: Book[], by: BookcasePrefs["group"], collections: { id: string; name: string }[]): Group[] {
  if (by === "none") return [{ key: "all", label: "", books }];
  const map = new Map<string, Group>();
  const add = (key: string, label: string, go: Section | undefined, book: Book) => {
    const g = map.get(key) ?? { key, label, go, books: [] };
    g.books.push(book);
    map.set(key, g);
  };
  for (const b of books) {
    if (by === "author") {
      const a = b.authors[0];
      add(a ? `a:${sortAuthor(a)}` : "~", a ?? t("Unknown author"), a ? { kind: "group", by: "author", value: a } : undefined, b);
    } else if (by === "series") {
      add(b.series ? `s:${b.series}` : "~", b.series ?? t("Not in a series"), b.series ? { kind: "group", by: "series", value: b.series } : undefined, b);
    } else if (by === "collection") {
      // A book in several collections stands on the first one's shelf.
      const c = collections.find((x) => b.collections.includes(x.id));
      add(c ? `c:${c.name}` : "~", c?.name ?? t("In no collection"), c ? { kind: "collection", id: c.id } : undefined, b);
    } else if (by === "status") {
      add(`${STATUS_ORDER[b.status]}`, t(STATUS_LABEL[b.status]), { kind: b.status }, b);
    } else {
      const f = (bestFormat(b) ?? "file").toUpperCase();
      add(`f:${f}`, f, { kind: "group", by: "format", value: f }, b);
    }
  }
  // Series stand in reading order, everything else as sorted.
  const groups = [...map.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (by === "series") for (const g of groups) if (g.key !== "~") g.books.sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0));
  return groups;
}

/** A run of one group's books on a shelf, with its plaque when the group starts here. */
type Segment = { group: Group; books: Book[]; sizes: Size[]; first: boolean; width: number };
type Row = { segments: Segment[]; used: number };

/** Room between two groups on a shelf. */
const SECTION_GAP = 28;

const TALLEST = 188;
const MAX_DEPTH = 0.7 * TALLEST;
const PLANK = 16;
/** Room above the tallest book, and between one shelf and the next. */
const HEADROOM = 26;
const GAP = 44;

const rowHeightAt = (scale: number) => Math.round((TALLEST + HEADROOM) * scale) + PLANK + GAP;

/** Roughly how wide a group's plaque is, so a narrow group still leaves room for its name. */
const plaqueWidth = (g: Group) => (g.label ? Math.min(220, 34 + g.label.length * 7 + String(g.books.length).length * 7) : 0);

/**
 * Books fill each shelf from the left until the next would not fit. Groups
 * follow one another along the shelves with a gap between, each one at least
 * as wide as its plaque, and a group only starts a new shelf when it would
 * otherwise begin too close to the end of this one.
 */
function pack(groups: Group[], scale: number, rowWidth: number, sets?: ReadonlySet<string>) {
  const rows: Row[] = [];
  let row: Row = { segments: [], used: 0 };
  const close = () => {
    if (row.segments.length) rows.push(row);
    row = { segments: [], used: 0 };
  };
  for (const group of groups) {
    const sizes = group.books.map((b) => sizeOf(b, scale, sets));
    const label = plaqueWidth(group);
    let seg: Segment | null = null;
    let first = true;
    group.books.forEach((book, i) => {
      const w = sizes[i].w + 2;
      const start = !seg;
      const gap = start && row.segments.length ? SECTION_GAP : 0;
      // A group's first book needs room for the plaque beside it too.
      const need = start ? gap + Math.max(w, first ? label : 0) : w;
      if (row.used + need > rowWidth && (row.segments.length || seg)) {
        if (seg) row.segments.push(seg);
        close();
        seg = null;
        return pushBook(book, sizes[i]);
      }
      pushBook(book, sizes[i]);
    });
    function pushBook(book: Book, size: Size) {
      if (!seg) {
        const gap = row.segments.length ? SECTION_GAP : 0;
        row.used += gap;
        seg = { group, books: [], sizes: [], first, width: 0 };
        first = false;
      }
      seg.books.push(book);
      seg.sizes.push(size);
      seg.width += size.w + 2;
      row.used += size.w + 2;
    }
    if (seg) {
      const s = seg as Segment;
      // A narrow group is padded out to its plaque's width.
      const pad = s.first ? Math.max(0, plaqueWidth(group) - s.width) : 0;
      s.width += pad;
      row.used += pad;
      row.segments.push(s);
    }
  }
  close();
  return rows;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ------------------------------------------------------------------------ */
/* One book                                                                  */
/* ------------------------------------------------------------------------ */

type Hover = (book: Book | null, el?: HTMLElement) => void;

/** The band a set wears across its spines, at one height, so it runs from book to book. */
type Band = { colour: string; ink: string; bottom: number; height: number };

const BANDS = ["#1d1b18", "#8a2f25", "#b98a2f", "#2f5d46", "#27406f", "#5b3a72", "#efe7d6"];

function bandFor(series: string, scale: number): Band {
  const colour = BANDS[hashString(series) % BANDS.length];
  return { colour, ink: colour === "#efe7d6" || colour === "#b98a2f" ? "#1d1b18" : "#f6f5f1", bottom: Math.round(TALLEST * 0.15 * scale), height: Math.max(9, Math.round(13 * scale)) };
}

/** The spine, as it's drawn on the shelf's plane and on a whole book alike. */
function Spine({ book, size, prefs, hidden, style, band }: { book: Book; size: Size; prefs: BookcasePrefs; hidden?: boolean; style?: CSSProperties; band?: Band }) {
  const { w, h } = size;
  const { base, ink } = spineOf(book, prefs.spines);
  const title = Math.max(9, Math.min(w * 0.42, h * 0.09));
  return (
    <div style={{ background: base, color: ink, visibility: hidden ? "hidden" : undefined, ...style }} className="flex size-full flex-col items-center overflow-hidden rounded-[2px] py-[9%]">
      <span className="mb-[18%] h-px w-[62%] opacity-50" style={{ background: ink }} />
      <span
        className="serif min-h-0 flex-1 overflow-hidden leading-none font-medium text-ellipsis whitespace-nowrap"
        style={{ writingMode: "vertical-rl", fontSize: title, maxHeight: "100%" }}
      >
        {book.title}
      </span>
      {prefs.authors && (
        <span className="mt-[14%] max-h-[26%] overflow-hidden leading-none text-ellipsis whitespace-nowrap opacity-70" style={{ writingMode: "vertical-rl", fontSize: title * 0.72 }}>
          {book.authors[0]?.split(" ").pop() ?? ""}
        </span>
      )}
      {book.favorite && <span className="mt-[10%] leading-none opacity-80" style={{ fontSize: title * 0.8 }}>✦</span>}
      <span className="mt-[18%] h-px w-[62%] opacity-50" style={{ background: ink }} />
      {/* Light on a rounded spine. */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(90deg, rgb(0 0 0 / 0.28), rgb(255 255 255 / 0.14) 28%, rgb(0 0 0 / 0.04) 64%, rgb(0 0 0 / 0.32))" }}
      />
      {/* Finished books carry a quiet band of foil at the foot. */}
      {book.status === "finished" && <span className="absolute inset-x-[18%] bottom-[2.5%] h-[2px] rounded-full opacity-60" style={{ background: ink }} />}
      {band && (
        <span
          className="absolute inset-x-0 flex items-center justify-center overflow-hidden font-medium tabular-nums"
          style={{ bottom: band.bottom, height: band.height, background: band.colour, color: band.ink, fontSize: band.height * 0.72 }}
        >
          {book.seriesIndex ?? ""}
        </span>
      )}
    </div>
  );
}

const face: CSSProperties = { position: "absolute", backfaceVisibility: "hidden", pointerEvents: "none" };

/** The page edges on top of a book, with its own colour at either end. */
const topStyle = ({ w, h, d }: Size, base: string): CSSProperties => ({
  ...face,
  width: w,
  height: d,
  left: 0,
  top: (h - d) / 2,
  background: `linear-gradient(90deg, ${base} 0 2px, transparent 2px calc(100% - 2px), ${base} calc(100% - 2px)), repeating-linear-gradient(90deg, #ece6d8 0 1px, #f8f5ee 1px 3px)`,
});

/** A ribbon rises out of the pages of a book being read, taller the further in. */
function ribbonStyle(book: Book, { w, h, d }: Size, prefs: BookcasePrefs, z: number): CSSProperties | null {
  // Books being read wear the bookcase's ribbon; a book can have its own, or none.
  if (!prefs.ribbons || book.ribbon === "none" || (book.status !== "reading" && !book.ribbon)) return null;
  return {
    position: "absolute",
    pointerEvents: "none",
    left: w * 0.5 - Math.max(2.5, w * 0.11),
    width: Math.max(5, w * 0.22),
    height: (h * (0.05 + Math.min(1, book.progress ?? 0) * 0.07)) | 0,
    bottom: h - 1,
    background: ribbonColour(book.ribbon ?? prefs.ribbon),
    clipPath: "polygon(0 0, 50% 22%, 100% 0, 100% 100%, 0 100%)",
    transform: `translateZ(${z + d / 2 - Math.max(4, d * 0.08)}px)`,
  };
}

/** What a book at rest adds to the spine already on the shelf's plane: its top, and the sides that can be seen. */
const RestingBook = memo(function RestingBook({ book, size, front, prefs, left, right }: { book: Book; size: Size; front: number; prefs: BookcasePrefs; left: boolean; right: boolean }) {
  const { w, h, d } = size;
  const { base } = spineOf(book, prefs.spines);
  const z = front - d / 2;
  const side: CSSProperties = { ...face, width: d, height: h, left: (w - d) / 2, top: 0, background: base };
  const ribbon = ribbonStyle(book, size, prefs, z);
  return (
    <>
      <div style={{ ...topStyle(size, base), transform: `translateZ(${z}px) rotateX(90deg) translateZ(${h / 2}px)` }} />
      {ribbon && <div style={ribbon} />}
      {right && (
        <div style={{ ...side, transform: `translateZ(${z}px) rotateY(90deg) translateZ(${w / 2}px)` }}>
          <span className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(0 0 0 / 0.25), transparent 12%)" }} />
        </div>
      )}
      {left && (
        <div style={{ ...side, transform: `translateZ(${z}px) rotateY(-90deg) translateZ(${w / 2}px)` }}>
          <span className="absolute inset-0 bg-black/45" />
        </div>
      )}
    </>
  );
});

/** How a whole book stands: lifted by the pointer, pulled out and turned, or settling back. */
type Pose = "lifted" | "pulled" | "settling";

/** The one or two books being touched, with every face and the real cover. */
const WholeBook = memo(function WholeBook({ book, size, pose, front, prefs, handlers, band }: { book: Book; size: Size; pose: Pose; front: number; prefs: BookcasePrefs; handlers: BookHandlers; band?: Band }) {
  const { w, h, d } = size;
  const { base } = spineOf(book, prefs.spines);
  const z = front - d / 2;
  const ribbon = ribbonStyle(book, size, prefs, 0);
  const transform = pose === "pulled" ? `translateZ(${z + d * 0.9}px) translateY(-10px) rotateY(-58deg)` : pose === "lifted" ? `translateZ(${z + 12}px) translateY(-6px)` : `translateZ(${z}px)`;
  return (
    <div
      // Comes up from where it rested, and goes back there before it's taken away.
      className="book-whole absolute inset-0"
      style={{ transformStyle: "preserve-3d", transform, ["--rest" as string]: `translateZ(${z}px)`, pointerEvents: pose === "pulled" ? undefined : "none" }}
      {...(pose === "pulled" ? handlers : {})}
      draggable={pose === "pulled" || undefined}
    >
      <div style={{ ...face, inset: 0, transform: `translateZ(${d / 2}px)` }}>
        <Spine book={book} size={size} prefs={prefs} band={band} />
      </div>
      {ribbon && <div style={ribbon} />}
      {/* The front cover, on the right, turned out when the book is picked. */}
      <div style={{ ...face, width: d, height: h, left: (w - d) / 2, top: 0, pointerEvents: "auto", transform: `rotateY(90deg) translateZ(${w / 2}px)` }}>
        <Cover book={book} className="!aspect-auto size-full rounded-[2px]" />
        <span className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(0 0 0 / 0.25), transparent 12%)" }} />
      </div>
      {/* The back cover, on the left, in shade. */}
      <div style={{ ...face, width: d, height: h, left: (w - d) / 2, top: 0, background: base, transform: `rotateY(-90deg) translateZ(${w / 2}px)` }}>
        <span className="absolute inset-0 bg-black/45" />
      </div>
      <div style={{ ...topStyle(size, base), transform: `rotateX(90deg) translateZ(${h / 2}px)` }} />
    </div>
  );
});

type BookHandlers = {
  onMouseDown: (e: MouseEvent) => void;
  onContextMenu: () => void;
  onDragStart: (e: DragEvent) => void;
};

/** The book a press landed on, for the press that may follow it. */
let pressed: string | null = null;

const bookHandlers = (book: Book, visible: Book[]): BookHandlers => ({
  onMouseDown: (e) => {
    if (e.button !== 0) return;
    // A first press pulls the book out, so a second lands on something else, and the
    // browser's double click only fires on one element. Its count of presses goes by place and time.
    if (e.detail >= 2 && pressed) return void openReader(pressed);
    pressed = book.id;
    selectBook(e, book.id, visible);
  },
  onContextMenu: () => targetIds(book.id),
  onDragStart: (e) => dragBooks(e, book.id),
});

/** A spine on the shelf's plane: what can be pointed at and clicked, whatever else the book is doing. */
const SpineSlot = memo(function SpineSlot({ book, size, whole, visible, prefs, band, onEnter, onLeave }: { book: Book; size: Size; whole: boolean; visible: Book[]; prefs: BookcasePrefs; band?: Band; onEnter: (book: Book, el: HTMLElement) => void; onLeave: () => void }) {
  return (
    <div
      className="group relative shrink-0"
      style={{ width: size.w, height: size.h }}
      {...bookHandlers(book, visible)}
      onMouseEnter={(e) => onEnter(book, e.currentTarget)}
      onMouseLeave={onLeave}
      draggable
    >
      <Spine book={book} size={size} prefs={prefs} hidden={whole} band={band} />
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* One shelf                                                                 */
/* ------------------------------------------------------------------------ */

/** How long a book takes to settle back into the shelf, the length of book-whole's transition. */
const SETTLING = 520;

/**
 * Which of a shelf's books are whole right now, and how they stand: the one
 * pointed at, the ones picked, and any on their way back to rest.
 */
function usePoses(row: Row, selected: Set<string>) {
  const [hot, setHot] = useState<string | null>(null);
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set());
  const active = useMemo(() => {
    const out = new Map<string, Pose>();
    for (const seg of row.segments) for (const book of seg.books) if (selected.has(book.id)) out.set(book.id, "pulled");
    if (hot && !out.has(hot)) out.set(hot, "lifted");
    return out;
  }, [row, selected, hot]);
  const before = useRef(active);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Before the screen updates, so a book let go of never blinks out of its place.
  useLayoutEffect(() => {
    const left = [...before.current.keys()].filter((id) => !active.has(id));
    before.current = active;
    for (const id of active.keys()) {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
    }
    if (!left.length) return;
    setSettling((now) => new Set([...now, ...left]));
    for (const id of left) {
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setSettling((now) => {
            const next = new Set(now);
            next.delete(id);
            return next;
          });
        }, SETTLING),
      );
    }
  }, [active]);
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((timer) => clearTimeout(timer));
  }, []);
  const poses = useMemo(() => {
    const all = new Map<string, Pose>(active);
    for (const id of settling) if (!all.has(id)) all.set(id, "settling");
    return all;
  }, [active, settling]);
  return { poses, setHot };
}

const ShelfRow = memo(function ShelfRow({
  row, width, scale, tiltX, tiltY, selected, visible, prefs, onHover, bands,
}: {
  row: Row;
  width: number;
  scale: number;
  tiltX: MotionValue<number>;
  tiltY: MotionValue<number>;
  selected: Set<string>;
  visible: Book[];
  prefs: BookcasePrefs;
  onHover: Hover;
  bands: ReadonlyMap<string, Band>;
}) {
  const depth = MAX_DEPTH * scale;
  const front = depth / 2 - 3;
  const tallest = Math.max(...row.segments.flatMap((g) => g.sizes.map((s) => s.h)));
  const { poses, setHot } = usePoses(row, selected);
  const enter = useCallback((book: Book, el: HTMLElement) => {
    setHot(book.id);
    onHover(book, el);
  }, [setHot, onHover]);
  const leave = useCallback(() => {
    setHot(null);
    onHover(null);
  }, [setHot, onHover]);
  // Where each book stands along the shelf, to tell which of its sides face the viewer.
  const offsets = useMemo(() => {
    const map = new Map<string, number>();
    let x = 0;
    for (const seg of row.segments) {
      seg.books.forEach((book, i) => {
        map.set(book.id, x + seg.sizes[i].w / 2);
        x += seg.sizes[i].w + 2;
      });
      x = x + SECTION_GAP;
    }
    return map;
  }, [row]);
  const m = MATERIALS[prefs.material];
  return (
    <div className="flex justify-center" style={{ perspective: 1100 + 500 * scale, perspectiveOrigin: "50% -30%" }}>
      <motion.div className="relative" style={{ width, height: tallest + PLANK + Math.round(HEADROOM * scale), rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d" }}>
        {/* The back of the case. */}
        <div
          className="absolute -inset-x-6 rounded-t-[10px] border"
          style={{ top: 0, bottom: PLANK, background: m.back, borderColor: m.edge, transform: `translateZ(${-depth / 2 - 1}px)` }}
        />
        {/* The shelf board, its top and its front edge. */}
        <div
          className="absolute -inset-x-6"
          style={{ bottom: PLANK, height: depth, background: m.top, transformOrigin: "bottom", transform: `translateZ(${depth / 2}px) rotateX(90deg)` }}
        />
        <div
          className="absolute -inset-x-6 bottom-0 rounded-[4px] border shadow-card"
          style={{ height: PLANK, background: m.front, borderColor: m.edge, transform: `translateZ(${depth / 2}px)` }}
        >
          {/* Plaques on the shelf's edge name each group where it begins. */}
          {row.segments.map((seg, i) => {
            if (!seg.first || !seg.group.label) return null;
            const left = 24 + row.segments.slice(0, i).reduce((n, x) => n + x.width + SECTION_GAP, 0);
            const go = seg.group.go;
            return (
              <button
                key={seg.group.key}
                onClick={() => go && useStore.setState({ section: go, selection: [] })}
                disabled={!go}
                title={go ? t("Show only {name}", { name: seg.group.label }) : undefined}
                style={{ left, maxWidth: Math.max(seg.width, 80) }}
                className="absolute top-1/2 flex h-6 -translate-y-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 text-caption font-medium whitespace-nowrap text-foreground shadow-float transition-transform duration-150 enabled:hover:-translate-y-[60%]"
              >
                <span className="truncate">{seg.group.label}</span>
                <span className="text-muted tabular-nums">{seg.group.books.length}</span>
              </button>
            );
          })}
        </div>
        {/* What can't be flat: the tops and sides of the books, and any book being touched. */}
        <div className="pointer-events-none absolute inset-x-0 flex items-end" style={{ bottom: PLANK, gap: SECTION_GAP, transformStyle: "preserve-3d" }}>
          {row.segments.map((seg) => (
            <div key={seg.group.key + seg.books[0].id} className="flex shrink-0 items-end gap-[2px]" style={{ width: seg.width, transformStyle: "preserve-3d" }}>
              {seg.books.map((book, i) => {
                const pose = poses.get(book.id);
                const faces = pose ? null : facesToShow(seg.sizes, i, offsets.get(book.id) ?? 0, width);
                return (
                  <div key={book.id} className="relative shrink-0" style={{ width: seg.sizes[i].w, height: seg.sizes[i].h, transformStyle: "preserve-3d", zIndex: pose === "pulled" ? 2 : undefined }}>
                    {pose ? (
                      <WholeBook book={book} size={seg.sizes[i]} pose={pose} front={front} prefs={prefs} handlers={bookHandlers(book, visible)} band={book.series ? bands.get(book.series) : undefined} />
                    ) : (
                      <RestingBook book={book} size={seg.sizes[i]} front={front} prefs={prefs} left={faces!.left} right={faces!.right} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {/* Every spine on this shelf stands level, so they're all one plane. */}
        <div className="absolute inset-x-0 flex items-end" style={{ bottom: PLANK, gap: SECTION_GAP, transform: `translateZ(${front}px)` }}>
          {row.segments.map((seg) => (
            <div key={seg.group.key + seg.books[0].id} className="flex shrink-0 items-end gap-[2px]" style={{ width: seg.width }}>
              {seg.books.map((book, i) => (
                <SpineSlot key={book.id} book={book} size={seg.sizes[i]} whole={poses.has(book.id)} visible={visible} prefs={prefs} band={book.series ? bands.get(book.series) : undefined} onEnter={enter} onLeave={leave} />
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* The pile on top of the case                                               */
/* ------------------------------------------------------------------------ */

/** Where a pile's books sit and how tall it stands. The longest lie at the bottom, as they would. */
function stackPile(books: Book[], scale: number) {
  let y = 0;
  const stacked = books
    .map((book) => ({ book, size: sizeOf(book, scale) }))
    .sort((a, b) => b.size.h - a.size.h)
    .map(({ book, size }) => {
      // A pile is never quite square.
      const shift = ((hashString(book.id) % 25) - 12) * scale;
      const place = { book, size, y, shift };
      y += size.w + 1;
      return place;
    });
  return { stacked, height: y };
}

/** Room a pile takes above the first shelf. */
const pileHeight = (books: Book[], scale: number) => (books.length ? stackPile(books, scale).height + Math.round(26 * scale) + PLANK + GAP : 0);

/** What's being read now, lying flat on top of the case. A few books, so each can be whole. */
const ReadingPile = memo(function ReadingPile({ books, width, scale, tiltX, tiltY, selected, visible, prefs, onHover }: {
  books: Book[];
  width: number;
  scale: number;
  tiltX: MotionValue<number>;
  tiltY: MotionValue<number>;
  selected: Set<string>;
  visible: Book[];
  prefs: BookcasePrefs;
  onHover: Hover;
}) {
  const depth = MAX_DEPTH * scale;
  const front = depth / 2 - 3;
  const m = MATERIALS[prefs.material];
  const { stacked, height } = useMemo(() => stackPile(books, scale), [books, scale]);
  const left = 32 * scale;
  return (
    <div className="flex justify-center" style={{ perspective: 1100 + 500 * scale, perspectiveOrigin: "50% -30%" }}>
      <motion.div className="relative" style={{ width, height: height + PLANK + Math.round(26 * scale), rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d" }}>
        {/* The top of the case, for them to lie on. */}
        <div className="absolute -inset-x-6" style={{ bottom: PLANK, height: depth, background: m.top, transformOrigin: "bottom", transform: `translateZ(${depth / 2}px) rotateX(90deg)` }} />
        <div className="absolute -inset-x-6 bottom-0 rounded-[4px] border shadow-card" style={{ height: PLANK, background: m.front, borderColor: m.edge, transform: `translateZ(${depth / 2}px)` }} />
        {stacked.map(({ book, size, y, shift }, i) => {
          const { base, ink } = spineOf(book, prefs.spines);
          const length = size.h;
          const thick = size.w;
          const d = size.d;
          const z = front - d / 2;
          const last = i === stacked.length - 1;
          const on = selected.has(book.id);
          const face: CSSProperties = { position: "absolute", backfaceVisibility: "hidden", pointerEvents: "none" };
          return (
            <div
              key={book.id}
              className="group absolute transition-transform duration-500 ease-smooth [transform:var(--rest)] hover:[transform:var(--lift)]"
              style={{
                left: left + shift,
                bottom: PLANK + y,
                width: length,
                height: thick,
                transformStyle: "preserve-3d",
                ["--rest" as string]: on ? `translateZ(${d * 0.3}px)` : "translateZ(0px)",
                ["--lift" as string]: on ? `translateZ(${d * 0.3}px)` : "translateZ(14px)",
              }}
              {...bookHandlers(book, visible)}
              onMouseEnter={(e) => onHover(book, e.currentTarget)}
              onMouseLeave={() => onHover(null)}
              draggable
            >
              {/* Its spine, lying on its side, facing out. */}
              <div className="absolute inset-0 flex items-center gap-3 overflow-hidden rounded-[2px] px-[6%]" style={{ background: base, color: ink, transform: `translateZ(${front}px)` }}>
                <span className="serif min-w-0 flex-1 truncate leading-none font-medium" style={{ fontSize: Math.max(9, Math.min(thick * 0.42, 15 * scale)) }}>{book.title}</span>
                {prefs.authors && <span className="shrink-0 leading-none opacity-70" style={{ fontSize: Math.max(8, Math.min(thick * 0.3, 11 * scale)) }}>{book.authors[0]?.split(" ").pop() ?? ""}</span>}
                <span className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(255 255 255 / 0.14), rgb(0 0 0 / 0.04) 60%, rgb(0 0 0 / 0.3))" }} />
              </div>
              {/* What faces up: the cover, on the book at the top of the pile. */}
              <div style={{ ...face, width: length, height: d, left: 0, top: (thick - d) / 2, background: base, transform: `translateZ(${z}px) rotateX(90deg) translateZ(${thick / 2}px)` }}>
                {last && <Cover book={book} className="!aspect-auto size-full rounded-[2px]" />}
              </div>
              {/* The pages at its far end, toward the middle of the case. */}
              <div style={{ ...face, width: d, height: thick, left: (length - d) / 2, top: 0, background: "repeating-linear-gradient(180deg, #ece6d8 0 1px, #f8f5ee 1px 3px)", transform: `translateZ(${z}px) rotateY(90deg) translateZ(${length / 2}px)` }} />
            </div>
          );
        })}
      </motion.div>
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* The case                                                                  */
/* ------------------------------------------------------------------------ */

export function Bookcase({ visible }: { visible: Book[] }) {
  const gridSize = useStore((s) => s.settings.gridSize);
  const prefs = useStore((s) => s.settings.bookcase);
  const collections = useStore((s) => s.collections);
  const selection = useStore((s) => s.selection);
  const selected = useMemo(() => new Set(selection), [selection]);
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const rowWidth = Math.max(240, Math.min(width - 112, 1600));
  const chosen = Math.min(1.5, Math.max(0.7, gridSize / 156));
  // What's being read lies in a pile on top, and isn't on the shelves as well.
  const pile = useMemo(() => (prefs.pile ? readingPile(visible) : []), [visible, prefs.pile]);
  const shelved = useMemo(() => {
    if (!pile.length) return visible;
    const lying = new Set(pile.map((b) => b.id));
    return visible.filter((b) => !lying.has(b.id));
  }, [visible, pile]);
  const sets = useMemo(() => (prefs.boxSets ? boxSets(shelved) : new Set<string>()), [shelved, prefs.boxSets]);
  const groups = useMemo(
    () =>
      groupBooks(shelved, prefs.group, collections).map((group) => {
        let books = group.books;
        if (prefs.rainbow && prefs.spines !== "ink") books = rainbowOrder(books, (book) => spineOf(book, prefs.spines).base);
        return { ...group, books: standTogether(books, sets) };
      }),
    [shelved, prefs.group, prefs.rainbow, prefs.spines, collections, sets],
  );
  // Books in shelf order, so the arrow keys walk along the shelves.
  const ordered = useMemo(() => [...pile, ...groups.flatMap((g) => g.books)], [pile, groups]);

  // A small library grows to fill the window when asked. The largest size
  // whose shelves still fit on screen wins, and the cover size setting is the least it gets.
  const scale = useMemo(() => {
    if (!prefs.fit || !width || !height || visible.length > 400) return chosen;
    // A book pulled out comes toward you and looks half as big again, so that has to fit too.
    const largest = Math.min(2.4, (height - 48) / (TALLEST * 1.5));
    for (let s = largest; s > chosen; s -= 0.05) {
      if (pack(groups, s, rowWidth, sets).length * rowHeightAt(s) + pileHeight(pile, s) <= height - 48) return s;
    }
    return chosen;
  }, [groups, chosen, rowWidth, width, height, prefs.fit, visible.length, sets, pile]);

  const shelves = useMemo(() => pack(groups, scale, rowWidth, sets), [groups, scale, rowWidth, sets]);
  const bands = useMemo(() => new Map([...sets].map((series) => [series, bandFor(series, scale)])), [sets, scale]);
  const rowHeight = rowHeightAt(scale);
  const lying = pileHeight(pile, scale);
  // Shelves that fit on screen sit in the middle of it.
  const spare = Math.max(32, Math.floor((height - shelves.length * rowHeight - lying) / 2));
  const virtual = useVirtualizer({ count: shelves.length, getScrollElement: () => ref.current, estimateSize: () => rowHeight, overscan: 1, paddingStart: spare + lying, paddingEnd: Math.max(96, spare) });
  useEffect(() => virtual.measure(), [rowHeight, spare, lying, virtual]);

  // The case leans a little toward the pointer, when that is wanted.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const tiltY = useSpring(mx, { stiffness: 80, damping: 20 });
  const tiltX = useSpring(my, { stiffness: 80, damping: 20 });
  useEffect(() => {
    if (prefs.lean) return;
    mx.set(0);
    my.set(0);
  }, [prefs.lean, mx, my]);
  const lean = (e: PointerEvent<HTMLDivElement>) => {
    if (!prefs.lean) return;
    const box = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - box.left) / box.width - 0.5) * 9);
    my.set(-((e.clientY - box.top) / box.height - 0.5) * 3);
  };

  // The book under the pointer gets its name shown above it.
  const [hover, setHover] = useState<{ book: Book; x: number; y: number } | null>(null);
  const onHover = useCallback<Hover>((book, el) => {
    if (!book || !el) return setHover(null);
    const r = el.getBoundingClientRect();
    setHover({ book, x: r.left + r.width / 2, y: r.top });
  }, []);

  // A name left over from before the shelves moved would point at the wrong book.
  useEffect(() => setHover(null), [shelves, scale]);

  const rowOf = useMemo(() => {
    const map = new Map<string, number>();
    shelves.forEach((s, i) => s.segments.forEach((g) => g.books.forEach((b) => map.set(b.id, i))));
    return map;
  }, [shelves]);
  useKeys(ordered, 1, (i) => virtual.scrollToIndex(rowOf.get(ordered[i]?.id) ?? 0, { align: "auto" }));

  const single = shelves.length === 1;
  const hoveredSelected = hover && selected.has(hover.book.id);

  return (
    <BooksMenu>
      <div
        ref={ref}
        className="scroll h-full overflow-x-hidden"
        onPointerMove={lean}
        onPointerLeave={() => {
          mx.set(0);
          my.set(0);
        }}
        onScroll={() => hover && setHover(null)}
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest(".group, button")) useStore.setState({ selection: [] });
        }}
      >
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {pile.length > 0 && (
            <div className="absolute left-0 w-full" style={{ top: spare }}>
              <ReadingPile books={pile} width={rowWidth} scale={scale} tiltX={tiltX} tiltY={tiltY} selected={selected} visible={ordered} prefs={prefs} onHover={onHover} />
            </div>
          )}
          {virtual.getVirtualItems().map((item) => (
            <div key={item.key} className="absolute left-0 w-full" style={{ transform: `translateY(${item.start}px)`, height: rowHeight }}>
              <ShelfRow
                row={shelves[item.index]}
                // One short shelf fits its books instead of standing half empty.
                width={single ? Math.min(rowWidth, shelves[0].used + 24) : rowWidth}
                scale={scale}
                tiltX={tiltX}
                tiltY={tiltY}
                selected={selected}
                visible={ordered}
                prefs={prefs}
                onHover={onHover}
                bands={bands}
              />
            </div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {hover && !hoveredSelected && (
          <motion.div
            key={hover.book.id}
            className="pointer-events-none fixed z-40 max-w-[260px] -translate-x-1/2 -translate-y-full rounded-item border border-border bg-card px-3 py-2 shadow-float"
            style={{ left: hover.x, top: hover.y - 16 }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE, delay: 0.25 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            <p className="line-clamp-2 text-label leading-snug font-medium">{hover.book.title}</p>
            <p className="line-clamp-1 text-caption text-muted">
              {authorsOf(hover.book)}
              {hover.book.status === "reading" && hover.book.progress ? t(", {n}% read", { n: Math.round(hover.book.progress * 100) }) : ""}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </BooksMenu>
  );
}
