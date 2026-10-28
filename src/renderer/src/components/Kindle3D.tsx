import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion, useSpring } from "framer-motion";
import type { KindleActivity } from "@/lib/store";
import type { Book } from "../../../shared/types";
import { FINISHES, type KindleModel } from "../../../shared/kindles";
import { Cover } from "./Cover";

const lightness = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** Corner radius in millimetres, for each kind of body. */
const CORNER = { keyboard: 6, buttons: 9, bezel: 9, flush: 7, grip: 6, scribe: 6 } as const;

const EINK = "#e7e5de";
const GLASS = "#131315";

/** Where the screen sits on the front, in millimetres. */
function screenRect(model: KindleModel) {
  const [W, H] = model.size;
  const sw = model.screen * 25.4 * 0.6;
  const sh = model.screen * 25.4 * 0.8;
  switch (model.shape) {
    case "keyboard":
      return { x: (W - sw) / 2, y: (H - sh) * 0.18, w: sw, h: sh };
    case "buttons":
      return { x: (W - sw) / 2, y: (H - sh) * 0.32, w: sw, h: sh };
    case "grip":
      return { x: 4.5, y: (H - sh) / 2, w: sw, h: sh };
    case "scribe":
      return { x: W - sw - 6, y: (H - sh) / 2, w: sw, h: sh };
    default:
      return { x: (W - sw) / 2, y: (H - sh) * 0.42, w: sw, h: sh };
  }
}

/** What's on the screen: the book's cover, the way e-ink shows it, or a page. */
function Screen({ model, book }: { model: KindleModel; book?: Book }) {
  if (book)
    return (
      <>
        <Cover
          book={book}
          large
          className="!aspect-auto size-full rounded-none"
          style={{ filter: model.colour ? "saturate(0.55) contrast(0.92) brightness(1.04)" : "grayscale(1) contrast(1.08) brightness(1.04)" }}
        />
        {/* E-ink paper shows through the darkest parts. */}
        <span className="absolute inset-0" style={{ background: EINK, mixBlendMode: "multiply", opacity: 0.55 }} />
        <span className="absolute inset-0" style={{ background: "rgb(40 38 34)", mixBlendMode: "screen", opacity: 0.12 }} />
      </>
    );
  return (
    <div className="flex size-full flex-col gap-[4.5%] px-[11%] pt-[13%]">
      <span className="mx-auto mb-[6%] h-[3%] w-[44%] rounded-full bg-[#2b2a27]/80" />
      {Array.from({ length: 13 }, (_, i) => (
        <span key={i} className="h-[1.8%] rounded-full bg-[#2b2a27]/45" style={{ width: i % 5 === 4 ? "62%" : "100%" }} />
      ))}
    </div>
  );
}

/** Stacked slices of a rounded box, front to back, so it has depth. */
function Slab({
  width,
  height,
  depth,
  radius,
  colour,
  face,
  n = 6,
}: {
  width: number;
  height: number;
  depth: number;
  radius: number;
  colour: string;
  /** What the front shows, over the colour. */
  face?: string;
  n?: number;
}) {
  const box: CSSProperties = { position: "absolute", left: 0, top: 0, width, height, borderRadius: radius };
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          style={{
            ...box,
            background: `color-mix(in oklab, ${colour} ${80 + Math.round(Math.sin((i / (n - 1)) * Math.PI) * 10)}%, black)`,
            transform: `translateZ(${-depth / 2 + (i * depth) / (n - 1)}px)`,
          }}
        />
      ))}
      <div style={{ ...box, background: face ? `${face}, ${colour}` : colour, transform: `translateZ(${depth / 2 + 0.3}px)` }} />
    </>
  );
}

const CORD = "#26262a";

/**
 * The cable at the Kindle's foot: pushed into the port when it's plugged in,
 * lying just out of it when it isn't. USB-C from 2021, micro-USB before.
 */
function Cable({ plugged, flowing, s, w, h, usbc }: { plugged: boolean; flowing: boolean; s: number; w: number; h: number; usbc: boolean }) {
  const mm = (v: number) => v * s;
  const cord = `M 0 0 C 0 ${mm(20)}, ${mm(8)} ${mm(32)}, ${mm(36)} ${mm(34)} S ${mm(78)} ${mm(28)}, ${mm(104)} ${mm(40)}`;
  const boot = { w: mm(10.5), h: mm(19), d: Math.max(3, mm(6.5)) };
  const plug = { w: mm(usbc ? 8.3 : 6.9), h: mm(6.5), d: Math.max(1.6, mm(usbc ? 2.6 : 2)) };
  return (
    <motion.div
      style={{ position: "absolute", left: w / 2 - boot.w / 2, top: h, width: boot.w, height: boot.h, transformStyle: "preserve-3d" }}
      initial={false}
      animate={{ y: plugged ? 0 : mm(15), rotateZ: plugged ? 0 : 8 }}
      transition={{ type: "spring", stiffness: 240, damping: 17 }}
    >
      {/* The metal end, hidden in the port when plugged in. */}
      <motion.div
        style={{ position: "absolute", left: (boot.w - plug.w) / 2, top: -plug.h, width: plug.w, height: plug.h, transformStyle: "preserve-3d" }}
        initial={false}
        animate={{ opacity: plugged ? 0 : 1 }}
      >
        <Slab
          width={plug.w}
          height={plug.h}
          depth={plug.d}
          radius={usbc ? plug.d / 2 : mm(0.5)}
          colour="#9a9ca1"
          face="linear-gradient(90deg, #7f8287, #eceef0 45%, #a4a7ac)"
          n={3}
        />
      </motion.div>
      <Slab
        width={boot.w}
        height={boot.h}
        depth={boot.d}
        radius={mm(3.2)}
        colour={CORD}
        face="linear-gradient(90deg, rgb(255 255 255 / 0.04), rgb(255 255 255 / 0.16) 40%, rgb(0 0 0 / 0.2))"
      />
      {/* The cord, trailing away across the table. */}
      <svg className="pointer-events-none absolute overflow-visible" style={{ left: boot.w / 2, top: boot.h - mm(1) }} width={1} height={1} aria-hidden>
        <path d={cord} stroke={CORD} strokeWidth={mm(4)} fill="none" strokeLinecap="round" />
        <path
          d={`M ${-mm(0.7)} 0 C ${-mm(0.7)} ${mm(20)}, ${mm(7.5)} ${mm(31)}, ${mm(36)} ${mm(33)} S ${mm(78)} ${mm(27)}, ${mm(104)} ${mm(39)}`}
          stroke="rgb(255 255 255 / 0.22)"
          strokeWidth={mm(0.9)}
          fill="none"
          strokeLinecap="round"
        />
        {/* While a book copies, light runs up the cord into the Kindle. */}
        {flowing &&
          [0, 0.33, 0.66].map((at) => (
            <circle key={at} r={mm(1.3)} style={{ fill: "var(--accent)", filter: "drop-shadow(0 0 3px var(--accent))" }}>
              <animateMotion dur="1.1s" begin={`${at * 1.1}s`} repeatCount="indefinite" path={cord} keyPoints="1;0" keyTimes="0;1" calcMode="linear" />
            </circle>
          ))}
      </svg>
    </motion.div>
  );
}

/** Radio waves over the Kindle while a book goes by email. */
function Waves({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 40 25" className="overflow-visible" aria-hidden>
      {[8, 15, 22].map((r, i) => (
        <motion.path
          key={r}
          d={`M ${20 - r} ${24 - r * 0.55} A ${r} ${r} 0 0 1 ${20 + r} ${24 - r * 0.55}`}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.6}
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.4, delay: i * 0.22, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </svg>
  );
}

/** What the screen shows over the book while it works: a bar filling, then a tick. */
function Status({ activity, s }: { activity: KindleActivity; s: number }) {
  const mm = (v: number) => v * s;
  return (
    <>
      {activity.state === "working" && (
        <motion.div
          className="absolute inset-x-[12%] bottom-[7%] overflow-hidden rounded-full bg-[#f4f2ec]"
          style={{ height: Math.max(4, mm(2.2)), boxShadow: `0 0 0 ${Math.max(1, mm(0.4))}px #1b1a18` }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {activity.progress > 0 ? (
            <motion.div
              className="h-full bg-[#1b1a18]"
              initial={false}
              animate={{ width: `${Math.max(8, activity.progress * 100)}%` }}
              transition={{ ease: [0.3, 0.9, 0.2, 1] }}
            />
          ) : (
            <motion.div
              className="h-full w-[34%] bg-[#1b1a18]"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </motion.div>
      )}
      {activity.state === "done" && (
        <motion.div
          className="absolute inset-0 m-auto flex items-center justify-center rounded-full bg-[#1b1a18] text-[#f4f2ec]"
          style={{ width: mm(26), height: mm(26) }}
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: [0, 1.15, 1], rotate: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.9, 0.3, 1.2] }}
        >
          <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.2 }} />
          </svg>
        </motion.div>
      )}
    </>
  );
}

/** A Kindle in 3D, in its own colour, turning toward the pointer. */
export function Kindle3D({
  model,
  finish,
  book,
  height = 240,
  className,
  cable,
  glow,
  activity,
}: {
  model: KindleModel;
  finish?: string;
  book?: Book;
  /** The device's height on screen, in pixels. */
  height?: number;
  className?: string;
  /** Draws a cable, plugged in or lying beside the port. */
  cable?: "plugged" | "unplugged";
  /** Lights up, for a book held over it. */
  glow?: boolean;
  /** A book on its way, for the screen and the cable to show. */
  activity?: KindleActivity | null;
}) {
  const still = useReducedMotion();
  const [W, H, D] = model.size;
  const s = height / H;
  const w = W * s;
  const d = Math.max(4, D * s * 1.25);
  const r = CORNER[model.shape] * s;
  const body = FINISHES[finish ?? ""]?.hex ?? FINISHES[model.finishes[0]].hex;
  // Glass fronts are black whatever colour the back is.
  const front = model.shape === "flush" || model.shape === "grip" ? GLASS : body;
  const pale = lightness(front) > 0.55;
  const screen = screenRect(model);
  const recessed = model.shape !== "flush" && model.shape !== "grip";

  // Small reactions on top of the float: a hop when a book arrives, a shake when it doesn't, a nudge when plugged in.
  const react = useAnimationControls();
  const mm0 = (v: number) => v * s;
  useEffect(() => {
    if (still || !activity) return;
    if (activity.state === "done") react.start({ y: [0, -16, 0, -5, 0], rotateZ: [0, -2.5, 2, 0, 0], transition: { duration: 0.9, ease: "easeOut" } });
    if (activity.state === "failed") react.start({ x: [0, -9, 9, -7, 7, -3, 0], transition: { duration: 0.55 } });
  }, [activity?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const wasPlugged = useRef(cable === "plugged");
  useEffect(() => {
    if (cable === "plugged" && !wasPlugged.current && !still) react.start({ y: [0, mm0(2), 0], transition: { duration: 0.35, delay: 0.12 } });
    wasPlugged.current = cable === "plugged";
  }, [cable]); // eslint-disable-line react-hooks/exhaustive-deps

  // E-ink refreshes with a black flash: when the book on it changes, and when it's tapped.
  const [taps, setTaps] = useState(0);
  const page = `${book?.id ?? "page"}:${taps}`;
  const firstPage = useRef(page);
  const tap = () => {
    setTaps((t) => t + 1);
    if (!still) react.start({ scale: [1, 0.97, 1], transition: { duration: 0.3 } });
  };

  const rest = { x: 8, y: -26 };
  const rx = useSpring(rest.x, { stiffness: 110, damping: 16 });
  const ry = useSpring(rest.y, { stiffness: 110, damping: 16 });
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (still) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    ry.set(-6 + x * 34);
    rx.set(6 - y * 16);
  };
  const leave = () => {
    rx.set(rest.x);
    ry.set(rest.y);
  };

  // Thin slices stacked front to back make the edge, rounded corners and all.
  const slices = useMemo(() => {
    const n = Math.min(16, Math.max(6, Math.round(d / 1.2)));
    return Array.from({ length: n }, (_, i) => ({
      z: -d / 2 + (i * d) / (n - 1),
      shade: 14 + Math.round(Math.sin((i / (n - 1)) * Math.PI) * 14),
    }));
  }, [d]);

  const face: CSSProperties = { position: "absolute", inset: 0, borderRadius: r };
  const mm = (v: number) => v * s;

  let extras: ReactNode = null;
  if (model.shape === "keyboard") {
    const top = screen.y + screen.h + 7;
    const area = H - top - 5;
    const rows = 4;
    const keyH = Math.min(6, (area - 14) / rows - 2);
    extras = (
      <div className="absolute flex flex-col items-center" style={{ left: mm(9), right: mm(9), top: mm(top), gap: mm(2) }}>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex w-full justify-between">
            {Array.from({ length: 10 }, (_, k) => (
              <span
                key={k}
                style={{ width: `${8.4}%`, height: mm(keyH), borderRadius: mm(1.6), background: pale ? "rgb(0 0 0 / 0.1)" : "rgb(255 255 255 / 0.14)" }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  } else if (model.shape === "buttons") {
    const y = screen.y + screen.h + (H - screen.y - screen.h) / 2;
    const pill = (left: number) => (
      <span
        key={left}
        className="absolute"
        style={{
          left: mm(left),
          top: mm(y - 1.5),
          width: mm(9),
          height: mm(3),
          borderRadius: 99,
          background: pale ? "rgb(0 0 0 / 0.16)" : "rgb(255 255 255 / 0.16)",
        }}
      />
    );
    extras = (
      <>
        {[W / 2 - 34, W / 2 - 22, W / 2 + 13, W / 2 + 25].map(pill)}
        <span
          className="absolute"
          style={{
            left: mm(W / 2 - 6),
            top: mm(y - 6),
            width: mm(12),
            height: mm(12),
            borderRadius: 99,
            boxShadow: `inset 0 0 0 ${mm(1.4)}px ${pale ? "rgb(0 0 0 / 0.18)" : "rgb(255 255 255 / 0.18)"}`,
          }}
        />
      </>
    );
  } else if (model.shape === "grip") {
    const cx = screen.x + screen.w + (W - screen.x - screen.w) / 2;
    extras = [0.4, 0.53].map((at) => (
      <span
        key={at}
        className="absolute"
        style={{ left: mm(cx - 1.2), top: mm(H * at), width: mm(2.4), height: mm(14), borderRadius: 99, background: "rgb(255 255 255 / 0.12)" }}
      />
    ));
  }

  return (
    <div
      className={className}
      style={{ perspective: 1100, transform: glow ? "scale(1.05)" : undefined, transition: "transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <motion.div className="relative mx-auto" style={{ width: w, height, transformStyle: "preserve-3d" }} animate={react} onPointerDown={tap}>
        <motion.div
          className="relative mx-auto"
          style={{ width: w, height, transformStyle: "preserve-3d", rotateX: rx, rotateY: ry }}
          animate={still ? undefined : { y: [0, -5, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* The edge. */}
          {slices.map(({ z, shade }) => (
            <div key={z} style={{ ...face, background: `color-mix(in oklab, ${body} ${100 - shade}%, black)`, transform: `translateZ(${z}px)` }} />
          ))}

          {/* The back, a touch lighter, for when it turns far. */}
          <div style={{ ...face, background: `color-mix(in oklab, ${body} 92%, white)`, transform: `translateZ(${-d / 2 - 0.5}px) rotateY(180deg)` }} />

          {/* The front. */}
          <div
            style={{
              ...face,
              background: front,
              transform: `translateZ(${d / 2 + 0.5}px)`,
              overflow: "hidden",
              boxShadow: glow
                ? `0 0 0 ${Math.max(2, mm(1.4))}px var(--accent), 0 0 ${mm(16)}px color-mix(in oklab, var(--accent) 60%, transparent)`
                : undefined,
              transition: "box-shadow 250ms",
            }}
          >
            <div
              className="absolute overflow-hidden"
              style={{
                left: mm(screen.x),
                top: mm(screen.y),
                width: mm(screen.w),
                height: mm(screen.h),
                background: EINK,
                borderRadius: mm(recessed ? 1.2 : 0.6),
                boxShadow: recessed ? `inset 0 ${mm(0.8)}px ${mm(2)}px rgb(0 0 0 / 0.38)` : undefined,
              }}
            >
              <Screen model={model} book={book} />
              {page !== firstPage.current && !still && (
                <motion.span
                  key={page}
                  className="pointer-events-none absolute inset-0"
                  initial={{ opacity: 1, backgroundColor: "#141311" }}
                  animate={{ opacity: [1, 1, 0], backgroundColor: ["#141311", "#f2f0ea", "#f2f0ea"] }}
                  transition={{ duration: 0.5, times: [0, 0.35, 1], ease: "easeOut" }}
                />
              )}
              {activity && <Status activity={activity} s={s} />}
              {/* The front light, warm and even. */}
              <span
                className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(120% 90% at 50% 0%, rgb(255 248 230 / 0.16), transparent 60%)" }}
              />
              {recessed && (
                <span className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 ${mm(0.6)}px ${mm(1.6)}px rgb(0 0 0 / 0.3)` }} />
              )}
            </div>
            {extras}
            {glow && (
              <span
                className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(80% 60% at 50% 45%, rgb(255 255 255 / 0.14), transparent 70%)" }}
              />
            )}
            {/* Light across the glass, or along a matte bezel. */}
            <span
              className="pointer-events-none absolute inset-0"
              style={{
                borderRadius: r,
                background: recessed
                  ? "linear-gradient(160deg, rgb(255 255 255 / 0.1), transparent 35%)"
                  : "linear-gradient(125deg, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0.03) 38%, transparent 52%, rgb(255 255 255 / 0.05))",
                boxShadow: `inset 0 0 0 ${Math.max(1, mm(0.4))}px rgb(255 255 255 / ${pale ? 0.5 : 0.07})`,
              }}
            />
          </div>
          {cable && (
            <Cable
              plugged={cable === "plugged"}
              flowing={activity?.via === "cable" && activity.state === "working"}
              s={s}
              w={w}
              h={height}
              usbc={model.year >= 2021}
            />
          )}
          {activity?.via === "email" && activity.state === "working" && (
            <div className="pointer-events-none absolute" style={{ left: w * 0.78, top: -w * 0.2, transform: `translateZ(${d / 2}px) rotate(32deg)` }}>
              <Waves size={w * 0.3} />
            </div>
          )}
        </motion.div>
      </motion.div>
      {/* Its shadow on the table. */}
      <div
        aria-hidden
        className="mx-auto rounded-[50%] blur-md"
        style={{ width: w * 0.85, height: Math.max(8, height * 0.05), marginTop: cable ? s * 84 : height * 0.06, background: "rgb(0 0 0 / 0.22)" }}
      />
    </div>
  );
}
