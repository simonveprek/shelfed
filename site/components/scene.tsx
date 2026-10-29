"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { asset } from "@/lib";
import { DownloadButton } from "./download";

type Chapter = { clip: string; label: string; title: ReactNode; line?: string; facts?: string[] };

/** What the window shows as you scroll, one idea at a time. */
const CHAPTERS: Chapter[] = [
  {
    clip: "views",
    label: "Shelfed showing a library as covers, a list, shelves and a 3D bookcase",
    title: (
      <>
        A quiet home for your <span className="font-serif font-normal italic tracking-[-0.02em]">books</span>.
      </>
    ),
  },
  { clip: "bookcase", label: "The 3D bookcase changing from oak to slate to walnut", title: "Every book where you can see it.", line: "Covers, a list, shelves, or a bookcase in oak, walnut or slate.", facts: ["Plain files, a folder per author", "Details from Open Library", "Collections, ratings, search"] },
  { clip: "reader", label: "Turning the pages of Pride and Prejudice", title: "Opens where you stopped.", line: "One calm reader for every format, with highlights and notes.", facts: ["Light, sepia, dark or black", "Bookmarks and search", "PDFs and comics too"] },
  { clip: "kindle-plug", label: "A Kindle plugged in, the window's edges lighting up", title: "It knows your Kindle by name.", line: "From a Kindle 2 to a Colorsoft, in 3D, in its own colour.", facts: ["Each model since the Kindle 2", "Read from its serial number", "Its highlights come back"] },
  { clip: "kindle-drop", label: "A book dropped onto the Kindle and copied across", title: "Drop a book on it. It's there.", line: "Copied by cable, or sent by email to any Kindle, anywhere.", facts: ["Kindle file made for you", "From your own mail account", "Gmail, Outlook and iCloud ready"] },
  { clip: "icons", label: "Settings switching between Shelfed's app icons", title: "And make it yours.", line: "Light or dark, and eight app icons to choose from.", facts: ["A colour for every spine", "Ribbons in the books you're reading", "Paper, oak, walnut or slate"] },
];

/**
 * The page's one big moment: the app's window pinned to the screen while the
 * story scrolls past, a chapter at a time. Each chapter plays its recording
 * from the start.
 */
export function Scene() {
  const section = useRef<HTMLDivElement>(null);
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const still = useReducedMotion();
  const [active, setActive] = useState(0);
  // Recordings load as their chapter comes near, not all at once.
  const [near, setNear] = useState(1);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.min(CHAPTERS.length - 1, Math.floor(p * CHAPTERS.length));
    setActive(next);
    setNear((n) => Math.max(n, next + 1));
  });

  // The window lies back a little at first, and comes up to face you as you begin.
  const tilt = useTransform(scrollYProgress, [0, 0.07], still ? [0, 0] : [16, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.07], still ? [1, 1] : [0.9, 1]);

  useEffect(() => {
    videos.current.forEach((video, i) => {
      if (!video) return;
      if (i === active) {
        video.currentTime = 0;
        if (!still) video.play().catch(() => {});
      } else video.pause();
    });
  }, [active, still]);

  const go = (i: number) => {
    const box = section.current;
    if (!box) return;
    const span = box.offsetHeight - window.innerHeight;
    window.scrollTo({ top: box.offsetTop + (i / CHAPTERS.length) * span + 2, behavior: still ? "auto" : "smooth" });
  };

  const chapter = CHAPTERS[active];
  return (
    <section ref={section} style={{ height: `${CHAPTERS.length * 90}svh` }} aria-label="What Shelfed does">
      <div className="sticky top-0 flex h-svh flex-col items-center overflow-hidden px-5 pt-[clamp(112px,17svh,168px)] sm:px-8">
        {/* The words, one chapter at a time. */}
        <div className="relative flex h-[clamp(196px,27svh,250px)] w-full max-w-[60rem] flex-col items-center text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center"
            >
              <h2 className={`font-medium tracking-[-0.045em] ${active === 0 ? "text-[clamp(2.4rem,6.2vw,4.75rem)] leading-[0.98]" : "text-[clamp(1.9rem,4.4vw,3.5rem)] leading-[1.02]"}`}>{chapter.title}</h2>
              {active === 0 ? (
                <div className="mt-6">
                  <DownloadButton center />
                </div>
              ) : (
                <>
                  <p className="mt-4 max-w-[34rem] text-[clamp(1rem,1.5vw,1.15rem)] leading-relaxed text-muted">{chapter.line}</p>
                  {chapter.facts && (
                    <ul className="mt-5 flex flex-wrap justify-center gap-2">
                      {chapter.facts.map((fact) => (
                        <li key={fact} className="rounded-full border border-border bg-card/60 px-3 py-1 text-[12.5px] text-muted">
                          {fact}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* The window, the same one all the way down. */}
        <motion.div className="relative w-[min(1180px,92vw,calc((100svh-clamp(112px,17svh,168px)-clamp(196px,27svh,250px)-48px)*1.6))]" style={{ rotateX: tilt, scale, transformPerspective: 1600, transformOrigin: "50% 0%" }}>

            <div className="relative aspect-[1280/800] overflow-hidden rounded-[15px] bg-card shadow-[var(--shadow-window)] ring-1 ring-line-strong">
              {/* Where macOS draws its traffic lights, which the recordings leave out. */}
              <span aria-hidden className="absolute z-10 flex" style={{ left: "1.56%", top: "2.25%", width: "4.06%", gap: "0.625%" }}>
                {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
                  <span key={color} className="aspect-square flex-1 rounded-full" style={{ background: color }} />
                ))}
              </span>
              {CHAPTERS.map((c, i) => (
                <video
                  key={c.clip}
                  ref={(el) => {
                    videos.current[i] = el;
                  }}
                  className="absolute inset-0 size-full transition-opacity duration-500"
                  style={{ opacity: i === active ? 1 : 0 }}
                  src={i <= near ? asset(`media/${c.clip}.mp4`) : undefined}
                  poster={asset(`media/${c.clip}.jpg`)}
                  aria-label={c.label}
                  aria-hidden={i !== active}
                  muted
                  playsInline
                  preload={i <= near ? "auto" : "none"}
                />
              ))}
            </div>
        </motion.div>

        {/* Where you are in the story, and a way to jump. */}
        <nav aria-label="Chapters" className="absolute right-5 bottom-6 flex gap-2 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 lg:top-1/2 lg:right-8 lg:bottom-auto lg:left-auto lg:translate-x-0 lg:-translate-y-1/2 lg:flex-col">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.clip}
              type="button"
              onClick={() => go(i)}
              aria-label={`Chapter ${i + 1}`}
              aria-current={i === active}
              className="group grid size-5 place-items-center"
            >
              <span className={`block rounded-full transition-all duration-300 ${i === active ? "size-2 bg-foreground" : "size-1.5 bg-foreground/25 group-hover:bg-foreground/50"}`} />
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}
