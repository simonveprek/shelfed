import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Button, cx, EASE } from "@/components/ui";
import { Point } from "@/components/fragms/points";
import { pickAndImport } from "@/lib/actions";
import { isMac, isWin } from "@/lib/api";
import { setSetting, useStore } from "@/lib/store";

/*
 * The first thing Shelfed shows. A short walk through what happened to
 * reading, told slowly, the way a book would. Each scene waits a few
 * seconds, or moves on with a click, the space bar or an arrow.
 */

/* ------------------------------------------------------------------------ */
/* Words that arrive one at a time                                           */
/* ------------------------------------------------------------------------ */

const line: Variants = {
  hidden: {},
  show: (delay: number = 0) => ({ transition: { staggerChildren: 0.075, delayChildren: delay } }),
};
const word: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(10px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.9, ease: EASE } },
};

function Words({ children, delay = 0, className }: { children: string; delay?: number; className?: string }) {
  return (
    <motion.p className={className} variants={line} custom={delay} initial="hidden" animate="show">
      {children.split(" ").map((w, i) => (
        <motion.span key={i} variants={word} className="mr-[0.26em] inline-block last:mr-0">
          {w}
        </motion.span>
      ))}
    </motion.p>
  );
}

const Big = ({ children, delay }: { children: string; delay?: number }) => (
  <Words delay={delay} className="serif max-w-[18ch] text-center text-[clamp(32px,4.6vw,58px)] leading-[1.08] font-medium tracking-[-0.02em] text-balance">
    {children}
  </Words>
);

const Small = ({ children, delay }: { children: string; delay?: number }) => (
  <Words delay={delay} className="mt-6 max-w-[38ch] text-center text-[clamp(16px,1.5vw,19px)] leading-relaxed text-muted text-balance">
    {children}
  </Words>
);

/* ------------------------------------------------------------------------ */
/* The scenes                                                                */
/* ------------------------------------------------------------------------ */

/** A single page, turning very slowly. The long conversation. */
function Page() {
  return (
    <div className="relative mb-14 h-[150px] w-[220px]" style={{ perspective: 900 }}>
      <div className="absolute inset-y-0 left-0 w-1/2 rounded-l-[6px] border border-border bg-card shadow-card" />
      <div className="absolute inset-y-0 right-0 w-1/2 rounded-r-[6px] border border-border bg-card shadow-card" />
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="absolute top-[22%] h-px bg-line-strong"
          style={{ left: "8%", width: `${30 - (i % 3) * 5}%`, top: `${22 + i * 12}%` }}
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, delay: 0.6 + i * 0.25, ease: EASE }}
        />
      ))}
      <motion.div
        className="absolute inset-y-0 left-1/2 w-1/2 rounded-r-[6px] border border-border bg-card"
        style={{ transformOrigin: "left center", transformStyle: "preserve-3d" }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: -172 }}
        transition={{ duration: 5.5, delay: 1.2, ease: [0.45, 0, 0.2, 1] }}
      >
        <div className="absolute inset-0 rounded-r-[6px]" style={{ background: "linear-gradient(90deg, rgb(0 0 0 / 0.08), transparent 40%)" }} />
      </motion.div>
    </div>
  );
}

const FEED = [
  "Trending now", "You have 4 new notifications", "Read in 30 seconds", "Swipe for more", "Live now", "12 things you missed today",
  "Someone liked your photo", "Watch next", "Breaking", "Only 2 minutes", "Your daily summary", "Don’t miss this", "New for you",
  "Tap to see why", "The short version", "Autoplay in 3", "Because you watched", "Hot take", "Skip intro", "Seen by 2 million",
];

/** The feed. Everything at once, all the time. */
function Feed() {
  const items = [...FEED, ...FEED];
  return (
    <div
      className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden"
      style={{ maskImage: "linear-gradient(transparent, #000 25%, #000 75%, transparent)" }}
    >
      {[-1, 0, 1].map((col) => (
        <motion.div
          key={col}
          className="flex w-[260px] shrink-0 flex-col gap-3 px-2 opacity-[0.55]"
          initial={{ y: col === 0 ? "-10%" : "-30%" }}
          animate={{ y: col === 0 ? "-60%" : "-80%" }}
          transition={{ duration: 7 + col, ease: "linear" }}
        >
          {items.map((t, i) => (
            <div key={i} className="flex items-center gap-3 rounded-item border border-border bg-card px-3.5 py-3 text-label text-muted shadow-card">
              <span className="size-6 shrink-0 rounded-full bg-control" />
              <span className="truncate">{t}</span>
            </div>
          ))}
        </motion.div>
      ))}
    </div>
  );
}

/** Books begun, never finished. Each bar stops where the reader did. */
function Unfinished() {
  const stops = [0.12, 0.31, 0.07, 0.22, 0.04, 0.17];
  return (
    <div className="mb-14 flex w-[300px] flex-col gap-3.5">
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-[86px] text-right text-caption text-muted tabular-nums">{["Chapter 3", "Page 140", "Page 12", "Chapter 7", "Page 6", "Part one"][i]}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-control">
            <motion.div
              className="h-full rounded-full bg-foreground"
              initial={{ width: 0 }}
              animate={{ width: `${stop * 100}%` }}
              transition={{ duration: 1.6 + stop * 3, delay: 0.5 + i * 0.18, ease: [0.3, 0.9, 0.2, 1] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Time, given. A circle drawn as slowly as an hour feels. */
function Hours() {
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" className="mb-14 overflow-visible text-foreground">
      <circle cx="66" cy="66" r="58" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
      <motion.circle
        cx="66"
        cy="66"
        r="58"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ rotate: -90, originX: 0.5, originY: 0.5 }}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 6.5, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
      />
      <motion.line
        x1="66" y1="66" x2="66" y2="26"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        // The hand turns on its foot, the dot in the middle. Framer reads the
        // origin from the line's own box, whose bottom middle is that dot.
        style={{ originX: 0.5, originY: 1 }}
        initial={{ rotate: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 6.5, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
      />
      <circle cx="66" cy="66" r="3" fill="currentColor" />
    </svg>
  );
}

/** Stillness. A small reader, reading. */
function Stillness() {
  return (
    <motion.div className="mb-12" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease: EASE }}>
      <Point shape="squircle" mood="reading" size={96} energy={0.4} look={[0.1, 0.4]} />
    </motion.div>
  );
}

type Scene = { id: string; wait: number; art?: ReactNode; title: string; body?: string; feed?: boolean };

const SCENES: Scene[] = [
  {
    id: "once",
    wait: 6200,
    art: <Page />,
    title: "A book was once the longest conversation you could have with another mind.",
  },
  {
    id: "faster",
    wait: 6000,
    feed: true,
    title: "Then everything got faster.",
    body: "We learned to skim, to scroll, to swipe. To read the first line and move on.",
  },
  {
    id: "fewer",
    wait: 6200,
    art: <Unfinished />,
    title: "We read more words than ever, and finish fewer of them.",
    body: "Somewhere a chapter waits for you, still open on the page you left.",
  },
  {
    id: "asks",
    wait: 7000,
    art: <Hours />,
    title: "A book asks for something rare.",
    body: "Hours of your attention, given freely, to one voice that is not your own.",
  },
  {
    id: "gives",
    wait: 6500,
    art: <Stillness />,
    title: "It gives back something rarer.",
    body: "A mind that can sit with one thought for a long time, and come back changed.",
  },
];

/* ------------------------------------------------------------------------ */
/* The last scene, where the library begins                                  */
/* ------------------------------------------------------------------------ */

/** The last word. Nothing but the line, and a way in. */
function Welcome({ done }: { done: () => void }) {
  const link = "underline decoration-underline underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground";
  return (
    <div className="flex flex-col items-center">
      <Big>Now, read something that takes a while.</Big>
      <motion.div
        className="mt-14 flex flex-col items-center gap-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 1.6, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="primary"
          size="lg"
          className="px-7"
          onClick={() => {
            done();
            pickAndImport(false);
          }}
        >
          Choose your books
        </Button>
        <p className="text-label text-muted">
          <button
            className={link}
            onClick={() => {
              done();
              pickAndImport(true);
            }}
          >
            add a folder
          </button>
          <span className="mx-2.5 opacity-50">·</span>
          <button className={link} onClick={done}>
            look around first
          </button>
        </p>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The walk                                                                  */
/* ------------------------------------------------------------------------ */

export function Onboarding() {
  const open = useStore((s) => s.ready && s.onboarding);
  const [step, setStep] = useState(0);
  const last = SCENES.length;
  const scene = SCENES[step];

  const done = useCallback(() => {
    setSetting({ onboarded: true });
    useStore.setState({ onboarding: false });
  }, []);
  const next = useCallback(() => setStep((s) => Math.min(last, s + 1)), [last]);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Each scene moves on by itself once it has been read.
  useEffect(() => {
    if (!open || step >= last) return;
    const timer = setTimeout(next, SCENES[step].wait);
    return () => clearTimeout(timer);
  }, [open, step, last, next]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        if (step < last) {
          e.preventDefault();
          next();
        }
      } else if (e.key === "ArrowLeft") back();
      else if (e.key === "Escape") done();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open, step, last, next, back, done]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex flex-col bg-background text-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.6 } }}
          exit={{ opacity: 0, filter: "blur(12px)", transition: { duration: 0.6, ease: EASE } }}
          onClick={() => step < last && next()}
        >
          {/* The window can still be moved by its top. */}
          <div className={cx("drag flex h-14 shrink-0 items-center justify-end px-5", isMac && "pl-20", isWin && "pr-[150px]")}>
            {step < last && (
              <button
                className="text-label text-muted transition-colors duration-150 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setStep(last);
                }}
              >
                Skip
              </button>
            )}
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                className="relative flex size-full flex-col items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.6 } }}
                exit={{ opacity: 0, y: -10, filter: "blur(8px)", transition: { duration: 0.5, ease: EASE } }}
              >
                {step < last ? (
                  <>
                    {scene.feed && <Feed />}
                    <div className={cx("relative flex flex-col items-center", scene.feed && "rounded-card bg-background/80 px-10 py-9 backdrop-blur-xl")}>
                      {scene.art}
                      <Big>{scene.title}</Big>
                      {scene.body && <Small delay={1.4}>{scene.body}</Small>}
                    </div>
                  </>
                ) : (
                  <Welcome done={done} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex h-20 shrink-0 items-center justify-center gap-2">
            {[...SCENES, null].map((_, i) => (
              <button
                key={i}
                aria-label={`Part ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setStep(i);
                }}
                className="flex h-6 items-center"
              >
                <motion.span
                  className="block h-1.5 rounded-full bg-foreground"
                  animate={{ width: i === step ? 22 : 6, opacity: i === step ? 0.9 : i < step ? 0.4 : 0.18 }}
                  transition={{ duration: 0.4, ease: EASE }}
                />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
