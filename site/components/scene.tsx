"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { STORY } from "@/content";
import { asset } from "@/lib";
import { DownloadButton } from "./download";

type Chapter = { clip: string; label: string; title: ReactNode; line?: string; facts?: string[] };

/** The recording for each chapter of the story, and what it shows, for screen readers. */
const CLIPS: Array<[string, string]> = [
  ["views", "Shelfed showing a library as covers, a list, shelves and a 3D bookcase"],
  ["bookcase", "The 3D bookcase changing from oak to slate to walnut"],
  ["reader", "Turning the pages of Pride and Prejudice"],
  ["kindle-plug", "A Kindle plugged in, the window's edges lighting up"],
  ["kindle-drop", "A book dropped onto the Kindle and copied across"],
  ["icons", "Settings switching between Shelfed's app icons"],
];

/** What the window shows as you scroll, one idea at a time. The words live in content.ts. */
const CHAPTERS: Chapter[] = STORY.map((chapter, i) => ({
  ...chapter,
  clip: CLIPS[i][0],
  label: CLIPS[i][1],
  // The first is the page's headline, with its one serif word.
  title:
    i === 0 ? (
      <>
        A quiet home for your <span className="font-serif font-normal italic tracking-[-0.02em]">books</span>.
      </>
    ) : (
      chapter.title
    ),
}));

/** How far into the scene the window has finished coming up to face you. */
const RISE = 0.07;

/**
 * The page's one big moment: the app's window pinned to the screen while the
 * story scrolls past, a chapter at a time. Each chapter plays its recording
 * from the start.
 *
 * Plain scroll events and CSS, no animation library: the page has to paint
 * its first frame fast on a phone.
 */
export function Scene() {
  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const [still, setStill] = useState(false);
  const [active, setActive] = useState(0);
  // The other chapters' pictures and the recordings wait until the page has loaded; then
  // the recordings come as their chapter comes near.
  const [near, setNear] = useState(-1);

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    setStill(query.matches);
    const change = () => setStill(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    const start = () => setNear((n) => Math.max(n, 1));
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  useEffect(() => {
    let queued = 0;
    const measure = () => {
      queued = 0;
      const box = section.current;
      if (!box) return;
      const span = box.offsetHeight - window.innerHeight;
      const p = Math.min(1, Math.max(0, -box.getBoundingClientRect().top / span));
      const next = Math.min(CHAPTERS.length - 1, Math.floor(p * CHAPTERS.length));
      setActive(next);
      if (next > 0) setNear((n) => Math.max(n, next + 1));
      // The window lies back a little at first, and comes up to face you as you begin.
      const rise = still ? 1 : Math.min(1, p / RISE);
      frame.current?.style.setProperty("transform", `perspective(1600px) rotateX(${16 * (1 - rise)}deg) scale(${0.9 + 0.1 * rise})`);
    };
    const queue = () => {
      if (!queued) queued = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(queued);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, [still]);

  useEffect(() => {
    videos.current.forEach((video, i) => {
      if (!video) return;
      if (i === active) {
        video.currentTime = 0;
        if (!still) video.play().catch(() => {});
      } else video.pause();
    });
  }, [active, still, near]);

  const go = (i: number) => {
    const box = section.current;
    if (!box) return;
    const span = box.offsetHeight - window.innerHeight;
    window.scrollTo({ top: box.offsetTop + (i / CHAPTERS.length) * span + 2, behavior: still ? "auto" : "smooth" });
  };

  return (
    <section ref={section} style={{ height: `${CHAPTERS.length * 90}svh` }} aria-label="What Shelfed does">
      {/* The whole story in words, for screen readers, search engines and AI agents, which don't scroll. */}
      <ol className="sr-only">
        {STORY.slice(1).map((chapter) => (
          <li key={chapter.title}>
            <h2>{chapter.title}</h2>
            <p>{chapter.line}</p>
            <ul>{chapter.facts?.map((fact) => <li key={fact}>{fact}</li>)}</ul>
          </li>
        ))}
      </ol>
      <div className="sticky top-0 flex h-svh flex-col items-center overflow-hidden px-5 pt-[clamp(112px,17svh,168px)] sm:px-8 short:flex-row short:justify-center short:gap-8 short:pt-16">
        {/* The words, every chapter stacked in one place, the current one showing. */}
        <div className="grid h-[284px] w-full max-w-[60rem] justify-items-center text-center sm:h-[clamp(196px,27svh,250px)] short:h-auto short:w-[40%] short:justify-items-start short:text-left">
          {CHAPTERS.map((chapter, i) => (
            <div
              key={chapter.clip}
              aria-hidden={i === 0 ? i !== active || undefined : true}
              inert={i !== active}
              className="col-start-1 row-start-1 flex flex-col items-center short:items-start short:self-center transition-[opacity,transform,filter] duration-450 ease-smooth motion-reduce:transition-none"
              style={
                i === active
                  ? undefined
                  : { opacity: 0, transform: `translateY(${i > active ? 14 : -10}px)`, filter: "blur(6px)", pointerEvents: "none" }
              }
            >
              {i === 0 ? (
                <>
                  <h1 className="text-[clamp(2.4rem,6.2vw,4.75rem)] short:text-[2.2rem] leading-[0.98] font-medium tracking-[-0.045em]">{chapter.title}</h1>
                  <div className="mt-6">
                    <DownloadButton center />
                  </div>
                </>
              ) : (
                <>
                  {/* Its heading is in the list for screen readers above; here it's only seen. */}
                  <p className="text-[clamp(1.9rem,4.4vw,3.5rem)] short:text-[1.75rem] leading-[1.02] font-medium tracking-[-0.045em]">{chapter.title}</p>
                  <p className="mt-4 max-w-[34rem] text-[clamp(1rem,1.5vw,1.15rem)] short:mt-3 short:text-[0.95rem] leading-relaxed text-muted">{chapter.line}</p>
                  {chapter.facts && (
                    <ul className="mt-5 flex flex-wrap justify-center gap-2 short:mt-4 short:justify-start">
                      {chapter.facts.map((fact) => (
                        <li key={fact} className="rounded-full border border-border bg-card/60 px-3 py-1 text-[12.5px] text-muted">
                          {fact}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* The window, the same one all the way down. */}
        <div
          ref={frame}
          className="relative w-[min(1180px,92vw,calc((100svh-clamp(112px,17svh,168px)-clamp(196px,27svh,250px)-48px)*1.6))] origin-top motion-reduce:!transform-none short:w-[min(56%,calc((100svh-88px)*1.6))]"
          style={{ transform: "perspective(1600px) rotateX(16deg) scale(0.9)" }}
        >
          <div className="relative aspect-[1280/800] overflow-hidden rounded-[15px] bg-card shadow-[var(--shadow-window)] ring-1 ring-line-strong">
            {CHAPTERS.map((c, i) => (
              <div key={c.clip} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: i === active ? 1 : 0 }} aria-hidden={i !== active}>
                {/* The first frame, as a picture, so the window paints before any video loads. */}
                {(i === 0 || near >= 0) && (
                  <img
                    src={asset(`media/${c.clip}.webp`)}
                    srcSet={[640, 960].map((w) => `${asset(`media/${c.clip}-${w}.webp`)} ${w}w`).concat(`${asset(`media/${c.clip}.webp`)} 1280w`).join(", ")}
                    sizes="(max-width: 700px) 92vw, min(1180px, 92vw)"
                    width={1280}
                    height={800}
                    alt={c.label}
                    fetchPriority={i === 0 ? "high" : "low"}
                    decoding={i === 0 ? "sync" : "async"}
                    className="absolute inset-0 size-full"
                  />
                )}
                {i <= near && (
                  <video
                    ref={(el) => {
                      videos.current[i] = el;
                    }}
                    className="absolute inset-0 size-full"
                    src={asset(`media/${c.clip}.mp4`)}
                    aria-hidden
                    muted
                    playsInline
                    preload="auto"
                  />
                )}
              </div>
            ))}
            {/* Where macOS draws its traffic lights, which the recordings leave out. */}
            <span aria-hidden className="absolute z-10 flex" style={{ left: "1.56%", top: "2.25%", width: "4.06%", gap: "0.625%" }}>
              {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
                <span key={color} className="aspect-square flex-1 rounded-full" style={{ background: color }} />
              ))}
            </span>
          </div>
        </div>

        {/* Where you are in the story, and a way to jump. */}
        <nav aria-label="Chapters" className="absolute right-5 bottom-6 flex gap-2 [@media(max-height:600px)]:hidden sm:right-auto sm:left-1/2 sm:-translate-x-1/2 lg:top-1/2 lg:right-8 lg:bottom-auto lg:left-auto lg:translate-x-0 lg:-translate-y-1/2 lg:flex-col">
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
