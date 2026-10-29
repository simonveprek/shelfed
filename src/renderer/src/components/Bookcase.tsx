import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, type MotionValue } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Book, BookcasePrefs } from "../../../shared/types";
import { EASE } from "@/components/ui";
import { openReader } from "@/lib/actions";
import { selectBook, targetIds } from "@/lib/select";
import { useStore, type Section } from "@/lib/store";
import { authorsOf, bestFormat, hashString, sortAuthor } from "@/lib/util";
import { rainbowKey } from "@/lib/rainbow";
import { CLOTH, ribbonColour } from "./Colours";
import { Cover } from "./Cover";
import { BooksMenu, dragBooks, useKeys } from "./Library";
import { t } from "../../../shared/i18n";

/*
 * The bookcase. Every book stands spine out on a shelf, in real 3D made of
 * CSS planes, so it stays light enough for thousands. Pointing lifts a book
 * a little, picking one pulls it out and turns it to show its cover, and the
 * whole case leans with the pointer. Shelves can be given to each author,
 * series, collection, reading status or format, and the case can be made of
 * paper, oak, walnut or slate.
 */

type Size = { w: number; h: number; d: number };

/** A book's size on the shelf. Thicker files make thicker books, the title picks its height. */
function sizeOf(book: Book, scale: number): Size {
  const hash = hashString(book.title + book.id);
  const bytes = Math.max(...book.formats.map((f) => f.size), 1);
  const thick = Math.min(44, Math.max(18, 15 + Math.log2(Math.max(bytes, 80_000) / 80_000) * 4.2 + ((hash >> 3) % 5)));
  const h = 156 + (hash % 32);
  return { w: Math.round(thick * scale), h: Math.round(h * scale), d: Math.round(h * 0.7 * scale) };
}

/* ------------------------------------------------------------------------ */
/* Spines                                                                    */
/* ------------------------------------------------------------------------ */

// For covers that give no colour of their own.
const BRIGHT = ["#1d1b18", "#3d7bff", "#8c857c", "#c4372b", "#2f8f5b", "#5b4b8a", "#b5651d", "#2b4bff", "#a23bff"];
// Shades of the kit's ink, so they follow light and dark.
const INK = [92, 80, 68, 56, 44, 32];

const lightness = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** The spine's colour and the ink that reads on it, in the chosen style. */
function spineOf(book: Book, style: BookcasePrefs["spines"]) {
  // A colour picked for this book wins over the style.
  if (book.spine) return { base: book.spine, ink: lightness(book.spine) > 0.6 ? "#1d1b18" : "#f6f5f1" };
  const hash = hashString(book.id);
  if (style === "ink") {
    const share = INK[hash % INK.length];
    return { base: `color-mix(in oklab, var(--foreground) ${share}%, var(--background))`, ink: share > 55 ? "var(--background)" : "var(--foreground)" };
  }
  const base = style === "cloth" ? CLOTH[hash % CLOTH.length] : (book.tint ?? BRIGHT[hash % BRIGHT.length]);
  return { base, ink: lightness(base) > 0.6 ? "#1d1b18" : "#f6f5f1" };
}

/* ------------------------------------------------------------------------ */
/* What the case is made of                                                  */
/* ------------------------------------------------------------------------ */

const grain = (wood: string) =>
  `repeating-linear-gradient(90deg, rgb(0 0 0 / 0.045) 0 1px, transparent 1px 6px, rgb(255 255 255 / 0.03) 6px 7px, transparent 7px 13px), linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(0 0 0 / 0.1)), ${wood}`;

/** The case's back, the shelf's top and front, their edges, and the metal of its bookends. */
type Material = { back: string; top: string; front: string; edge: string; metal: string };

const BRASS = "linear-gradient(135deg, #e3c48a, #b08d57 45%, #8a6a3c)";
const IRON = "linear-gradient(135deg, #5b5f66, #2f3237 55%, #1b1d20)";

export const MATERIALS: Record<BookcasePrefs["material"], Material & { label: string }> = {
  paper: { label: "Paper", back: "var(--well)", top: "var(--tile)", front: "var(--card)", edge: "var(--border)", metal: IRON },
  birch: { label: "Birch", back: grain("#f2e9d8"), top: grain("#e6d3b0"), front: grain("#d8c095"), edge: "rgb(120 90 40 / 0.2)", metal: BRASS },
  oak: { label: "Oak", back: grain("#e6d6bc"), top: grain("#cba06a"), front: grain("#b5884f"), edge: "rgb(90 55 20 / 0.25)", metal: BRASS },
  cherry: { label: "Cherry", back: grain("#4a241a"), top: grain("#9c5034"), front: grain("#86422b"), edge: "rgb(0 0 0 / 0.35)", metal: BRASS },
  walnut: { label: "Walnut", back: grain("#2e231c"), top: grain("#6e4c33"), front: grain("#5b3d29"), edge: "rgb(0 0 0 / 0.4)", metal: BRASS },
  ebony: { label: "Ebony", back: grain("#15110f"), top: grain("#2b231f"), front: grain("#221b18"), edge: "rgb(255 255 255 / 0.06)", metal: BRASS },
  white: { label: "White", back: "#f3f1ec", top: "#ffffff", front: "#fbfaf7", edge: "rgb(0 0 0 / 0.08)", metal: BRASS },
  sage: { label: "Sage", back: "#a7b59f", top: "#c4cfba", front: "#b2bfa7", edge: "rgb(40 60 30 / 0.2)", metal: BRASS },
  navy: { label: "Navy", back: "#1a2537", top: "#2d3d59", front: "#24344e", edge: "rgb(255 255 255 / 0.07)", metal: BRASS },
  slate: { label: "Slate", back: "#1d1f22", top: "#3a3e44", front: "#2c3035", edge: "rgb(255 255 255 / 0.07)", metal: IRON },
};

/* ------------------------------------------------------------------------ */
/* The order books stand in                                                  */
/* ------------------------------------------------------------------------ */

/** The books of a group in the order chosen. Series keep their reading order. */
function arrange(books: Book[], prefs: BookcasePrefs, keepOrder: boolean) {
  const order = prefs.order ?? "library";
  if (order === "library" || keepOrder) return books;
  const sorted = [...books];
  if (order === "colour") sorted.sort((a, b) => rainbowKey(spineOf(a, prefs.spines).base) - rainbowKey(spineOf(b, prefs.spines).base));
  else if (order === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
  else sorted.sort((a, b) => sortAuthor(a.authors[0] ?? "~").localeCompare(sortAuthor(b.authors[0] ?? "~")) || a.title.localeCompare(b.title));
  return sorted;
}

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

/** Room at a shelf's end for bookends and an ornament, at full size. */
const DECOR_ROOM = 118;

const rowHeightAt = (scale: number) => Math.round((TALLEST + HEADROOM) * scale) + PLANK + GAP;

/** Roughly how wide a group's plaque is, so a narrow group still leaves room for its name. */
const plaqueWidth = (g: Group) => (g.label ? Math.min(220, 34 + g.label.length * 7 + String(g.books.length).length * 7) : 0);

/**
 * Books fill each shelf from the left until the next would not fit. Groups
 * follow one another along the shelves with a gap between, each one at least
 * as wide as its plaque, and a group only starts a new shelf when it would
 * otherwise begin too close to the end of this one.
 */
function pack(groups: Group[], scale: number, rowWidth: number) {
  const rows: Row[] = [];
  let row: Row = { segments: [], used: 0 };
  const close = () => {
    if (row.segments.length) rows.push(row);
    row = { segments: [], used: 0 };
  };
  for (const group of groups) {
    const sizes = group.books.map((b) => sizeOf(b, scale));
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

const Book3D = memo(function Book3D({
  book, size, selected, visible, front, prefs, onHover,
}: {
  book: Book;
  size: Size;
  selected: boolean;
  visible: Book[];
  /** How far forward the spine stands, so every book lines up with the shelf's edge. */
  front: number;
  prefs: BookcasePrefs;
  onHover: Hover;
}) {
  const { w, h, d } = size;
  const { base, ink } = spineOf(book, prefs.spines);
  const z = front - d / 2;
  const reading = book.status === "reading";
  const face: CSSProperties = { position: "absolute", backfaceVisibility: "hidden" };
  const title = Math.max(9, Math.min(w * 0.42, h * 0.09));
  // Books being read wear the bookcase's ribbon; a book can have its own, or none.
  const ribbon = prefs.ribbons && book.ribbon !== "none" && (reading || !!book.ribbon);

  return (
    <div
      className="group relative shrink-0"
      style={{ width: w, height: h, transformStyle: "preserve-3d", zIndex: selected ? 2 : undefined }}
      onMouseDown={(e) => e.button === 0 && selectBook(e, book.id, visible)}
      onDoubleClick={() => openReader(book.id)}
      onContextMenu={() => targetIds(book.id)}
      onMouseEnter={(e) => onHover(book, e.currentTarget)}
      onMouseLeave={() => onHover(null)}
      draggable
      onDragStart={(e) => dragBooks(e, book.id)}
    >
      <div
        className="absolute inset-0 transition-transform duration-500 ease-smooth [transform:var(--rest)] group-hover:[transform:var(--lift)]"
        style={{
          transformStyle: "preserve-3d",
          ["--rest" as string]: selected ? `translateZ(${z + d * 0.9}px) translateY(-10px) rotateY(-58deg)` : `translateZ(${z}px)`,
          ["--lift" as string]: selected ? `translateZ(${z + d * 0.9}px) translateY(-14px) rotateY(-58deg)` : `translateZ(${z + 12}px) translateY(-6px)`,
        }}
      >
        {/* The spine, facing out. */}
        <div
          style={{ ...face, inset: 0, background: base, color: ink, transform: `translateZ(${d / 2}px)` }}
          className="flex flex-col items-center overflow-hidden rounded-[2px] py-[9%]"
        >
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
        </div>

        {/* A ribbon rises out of the pages of a book being read, taller the further in. */}
        {ribbon && (
          <div
            style={{
              position: "absolute",
              left: w * 0.5 - Math.max(2.5, w * 0.11),
              width: Math.max(5, w * 0.22),
              height: (h * (0.05 + Math.min(1, book.progress ?? 0) * 0.07)) | 0,
              bottom: h - 1,
              background: ribbonColour(book.ribbon ?? prefs.ribbon),
              clipPath: "polygon(0 0, 50% 22%, 100% 0, 100% 100%, 0 100%)",
              transform: `translateZ(${d / 2 - Math.max(4, d * 0.08)}px)`,
            }}
          />
        )}

        {/* The front cover, on the right, turned out when the book is picked. */}
        <div style={{ ...face, width: d, height: h, left: (w - d) / 2, top: 0, transform: `rotateY(90deg) translateZ(${w / 2}px)` }}>
          <Cover book={book} className="!aspect-auto size-full rounded-[2px]" />
          <span className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(0 0 0 / 0.25), transparent 12%)" }} />
        </div>

        {/* The back cover, on the left, in shade. */}
        <div style={{ ...face, width: d, height: h, left: (w - d) / 2, top: 0, background: base, transform: `rotateY(-90deg) translateZ(${w / 2}px)` }}>
          <span className="absolute inset-0 bg-black/45" />
        </div>

        {/* The page edges, on top, with the ribbon's tail over them. */}
        <div
          style={{
            ...face,
            width: w,
            height: d,
            left: 0,
            top: (h - d) / 2,
            transform: `rotateX(90deg) translateZ(${h / 2}px)`,
            background: `linear-gradient(90deg, ${base} 0 2px, transparent 2px calc(100% - 2px), ${base} calc(100% - 2px)), repeating-linear-gradient(90deg, #ece6d8 0 1px, #f8f5ee 1px 3px)`,
          }}
        >

        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* One shelf                                                                 */
/* ------------------------------------------------------------------------ */

function ShelfRow({
  row, index, width, scale, tiltX, tiltY, selected, visible, prefs, onHover,
}: {
  row: Row;
  /** Which shelf this is, so the ornaments vary from one to the next. */
  index: number;
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
  const tallest = Math.max(...row.segments.flatMap((g) => g.sizes.map((s) => s.h)));
  const m = MATERIALS[prefs.material];
  return (
    <div className="flex justify-center" style={{ perspective: 1100 + 500 * scale, perspectiveOrigin: "50% -30%" }}>
      <motion.div className="relative" style={{ width, height: tallest + PLANK + Math.round(HEADROOM * scale), rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d" }}>
        {/* The back of the case. */}
        <div
          className="absolute -inset-x-6 rounded-t-[10px] border"
          style={{ top: 0, bottom: PLANK, background: m.back, borderColor: m.edge, transform: `translateZ(${-depth / 2 - 1}px)` }}
        />
        {prefs.lights && (
          <>
            {/* A warm strip under the shelf above, its light falling down the back and over the spines. */}
            <div
              className="pointer-events-none absolute -inset-x-6 top-0 rounded-t-[10px]"
              style={{ bottom: PLANK, background: "linear-gradient(180deg, rgb(255 196 120 / 0.5), rgb(255 190 110 / 0.16) 45%, transparent 85%)", transform: `translateZ(${-depth / 2}px)` }}
            />
            <div
              className="pointer-events-none absolute -inset-x-4 top-0 h-[3px] rounded-full"
              style={{ background: "#fff2dc", boxShadow: "0 0 10px 2px rgb(255 205 140 / 0.75), 0 8px 34px 8px rgb(255 190 110 / 0.3)", transform: `translateZ(${depth / 2 - 8}px)` }}
            />
          </>
        )}
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
        <div className="absolute inset-x-0 flex items-end gap-[3px]" style={{ bottom: PLANK, transformStyle: "preserve-3d" }}>
          {prefs.decor && <Bookend metal={m.metal} height={tallest * 0.58} scale={scale} side="left" />}
          <div className="flex items-end" style={{ gap: SECTION_GAP, transformStyle: "preserve-3d" }}>
          {row.segments.map((seg) => (
            <div key={seg.group.key + seg.books[0].id} className="flex shrink-0 items-end gap-[2px]" style={{ width: seg.width, transformStyle: "preserve-3d" }}>
              {seg.books.map((book, i) => (
                <Book3D
                  key={book.id}
                  book={book}
                  size={seg.sizes[i]}
                  selected={selected.has(book.id)}
                  visible={visible}
                  front={depth / 2 - 3}
                  prefs={prefs}
                  onHover={onHover}
                />
              ))}
            </div>
          ))}
          </div>
          {prefs.decor && <Bookend metal={m.metal} height={tallest * 0.58} scale={scale} side="right" />}
          {prefs.decor && <Ornament kind={ORNAMENTS[index % ORNAMENTS.length]} height={tallest} scale={scale} metal={m.metal} lit={Boolean(prefs.lights)} />}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Bookends and ornaments                                                    */
/* ------------------------------------------------------------------------ */

/** A bookend: a plate standing up against the row, on a foot that slides under the books. */
function Bookend({ metal, height, scale, side }: { metal: string; height: number; scale: number; side: "left" | "right" }) {
  return (
    <div className="relative shrink-0" style={{ width: Math.round(10 * scale), height }} aria-hidden>
      <div className="absolute inset-0 rounded-[2px] shadow-[0_2px_6px_rgb(0_0_0/0.25)]" style={{ background: metal }} />
      <div
        className="absolute bottom-0 h-[3px] rounded-[1px]"
        style={{ width: Math.round(26 * scale), background: metal, [side === "left" ? "left" : "right"]: 0, opacity: 0.85 }}
      />
    </div>
  );
}

const ORNAMENTS = ["plant", "lamp", "stack"] as const;
const STACK = ["#7a2e2e", "#2f5d50", "#c9a24a"];

/** Something on the shelf that isn't a book: a plant, a reading lamp, or a few books lying flat. */
function Ornament({ kind, height, scale, metal, lit }: { kind: (typeof ORNAMENTS)[number]; height: number; scale: number; metal: string; lit: boolean }) {
  const w = Math.round(78 * scale);
  if (kind === "stack") {
    const h = Math.round(14 * scale);
    return (
      <div className="ml-3 flex shrink-0 flex-col items-center" style={{ width: w }} aria-hidden>
        {STACK.map((colour, i) => (
          <div key={colour} className="rounded-[2px] shadow-[0_1px_2px_rgb(0_0_0/0.25)]" style={{ height: h, width: w - i * 7 * scale - (i === 1 ? -4 : 0), background: colour, marginLeft: i === 1 ? 6 * scale : 0 }} />
        ))}
      </div>
    );
  }
  const h = Math.round(height * (kind === "plant" ? 0.62 : 0.7));
  return (
    <svg className="ml-3 shrink-0 overflow-visible" width={w} height={h} viewBox="0 0 78 120" preserveAspectRatio="xMidYMax meet" aria-hidden>
      {kind === "plant" ? (
        <>
          {[[-38, 34], [-14, 40], [10, 42], [32, 36], [-26, 28], [22, 30]].map(([angle, length], i) => (
            <ellipse key={i} cx="39" cy={78 - length / 2} rx="7" ry={length / 2} fill={i % 2 ? "#4f7f52" : "#3f6b45"} transform={`rotate(${angle} 39 78)`} />
          ))}
          <path d="M22 78 h34 l-4 40 h-26 z" fill="#b8643e" />
          <rect x="20" y="74" width="38" height="8" rx="2" fill="#c97448" />
        </>
      ) : (
        <>
          {lit && (
            <>
              <defs>
                <radialGradient id="lamp-glow" cx="50%" cy="20%" r="60%">
                  <stop offset="0" stopColor="rgb(255 214 150)" stopOpacity="0.55" />
                  <stop offset="1" stopColor="rgb(255 214 150)" stopOpacity="0" />
                </radialGradient>
              </defs>
              <path d="M18 48 L-6 118 L88 118 L64 48 Z" fill="url(#lamp-glow)" />
            </>
          )}
          <rect x="24" y="112" width="34" height="6" rx="3" fill="#8a6a3c" />
          <rect x="39" y="44" width="4" height="70" fill="#a8824e" />
          <path d="M16 46 Q41 14 66 46 Z" fill={metal.includes("#5b5f66") ? "#2f3237" : "#2f5d50"} />
          <rect x="16" y="44" width="50" height="4" rx="2" fill="#b08d57" />
        </>
      )}
    </svg>
  );
}

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
  const groups = useMemo(
    () => groupBooks(visible, prefs.group, collections).map((g) => ({ ...g, books: arrange(g.books, prefs, prefs.group === "series" && g.key !== "~") })),
    [visible, prefs.group, prefs.order, prefs.spines, collections],
  );
  // Room kept at the end of every shelf for its bookends and an ornament.
  const room = (s: number) => (prefs.decor ? Math.round(DECOR_ROOM * s) : 0);
  // Books in shelf order, so the arrow keys walk along the shelves.
  const ordered = useMemo(() => groups.flatMap((g) => g.books), [groups]);

  // A small library grows to fill the window when asked. The largest size
  // whose shelves still fit on screen wins, and the cover size setting is the least it gets.
  const scale = useMemo(() => {
    if (!prefs.fit || !width || !height || visible.length > 400) return chosen;
    for (let s = 2.4; s > chosen; s -= 0.05) {
      if (pack(groups, s, rowWidth - room(s)).length * rowHeightAt(s) <= height - 48) return s;
    }
    return chosen;
  }, [groups, chosen, rowWidth, width, height, prefs.fit, prefs.decor, visible.length]);

  const shelves = useMemo(() => pack(groups, scale, rowWidth - room(scale)), [groups, scale, rowWidth, prefs.decor]);
  const rowHeight = rowHeightAt(scale);
  // Shelves that fit on screen sit in the middle of it.
  const spare = Math.max(32, Math.floor((height - shelves.length * rowHeight) / 2));
  const virtual = useVirtualizer({ count: shelves.length, getScrollElement: () => ref.current, estimateSize: () => rowHeight, overscan: 2, paddingStart: spare, paddingEnd: Math.max(96, spare) });
  useEffect(() => virtual.measure(), [rowHeight, spare, virtual]);

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
          {virtual.getVirtualItems().map((item) => (
            <div key={item.key} className="absolute left-0 w-full" style={{ transform: `translateY(${item.start}px)`, height: rowHeight }}>
              <ShelfRow
                row={shelves[item.index]}
                index={item.index}
                // One short shelf fits its books instead of standing half empty.
                width={single ? Math.min(rowWidth, shelves[0].used + 24 + room(scale)) : rowWidth}
                scale={scale}
                tiltX={tiltX}
                tiltY={tiltY}
                selected={selected}
                visible={ordered}
                prefs={prefs}
                onHover={onHover}
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
