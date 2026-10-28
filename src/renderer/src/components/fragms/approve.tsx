"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import { rounded, useTheme } from "./theme";

/**
 * Approve. What an agent wants to do, and a round button you hold to let
 * it. A ring fills while you hold, so nothing happens by accident. Below the
 * action it says whether it can be undone, and what will happen is one tap
 * away. Once approved it folds into a small receipt, with an Undo that runs
 * out. Needs React and Framer Motion. No Tailwind required. It takes its
 * colours from the text around it.
 *
 *   <Approve
 *     agent="Simmy"
 *     action="Email the summary to 12 people"
 *     details={["Sends from your address", "Attaches summary.pdf"]}
 *     undoFor={30}
 *     onApprove={send}
 *     onUndo={unsend}
 *   />
 *
 * Fragms 2.1.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type ApproveStatus =
  "waiting" | "running" | "done" | "denied" | "undone";

export type ApproveProps = {
  /** What the agent wants to do, in a few words. */
  action: string;
  /** What will happen, one line each, one tap away. */
  details?: string[];
  /** Who is asking. */
  agent?: string;
  /** Whether it can be undone. True, false, or your own words. */
  undo?: boolean | string;
  /** Seconds the Undo stays offered after approving. Left out, it stays. */
  undoFor?: number;
  /** High asks for a longer hold and turns red. */
  risk?: "normal" | "high";
  /** How long to hold, in milliseconds. 0 makes it a plain click. */
  hold?: number;
  /** The words under the action while pointing at the button. */
  approveLabel?: string;
  denyLabel?: string;
  /** Runs once approved. Return a promise and it shows as working until it settles. */
  onApprove?: () => void | Promise<unknown>;
  onDeny?: () => void;
  /** Offered in the receipt while it can still be undone. */
  onUndo?: () => void;
  /** Holds the status yourself. Left out, it keeps its own. */
  status?: ApproveStatus;
  /** The ring and the button. Left out, the theme's accent, or red for high risk. */
  color?: string;
  className?: string;
  style?: CSSProperties;
};

const EASE = [0.22, 1, 0.36, 1] as const;
// Words that shimmer by a mask, so they keep the colour the page gives them.
const SHINE = `@keyframes fragms-approve-shine{from{-webkit-mask-position:150% 0;mask-position:150% 0}to{-webkit-mask-position:-50% 0;mask-position:-50% 0}}`;
const shine = (seconds: number): CSSProperties => ({
  WebkitMaskImage:
    "linear-gradient(90deg, #000 30%, rgba(0,0,0,0.35) 50%, #000 70%)",
  maskImage: "linear-gradient(90deg, #000 30%, rgba(0,0,0,0.35) 50%, #000 70%)",
  WebkitMaskSize: "250% 100%",
  maskSize: "250% 100%",
  animation: `fragms-approve-shine ${seconds}s linear infinite`,
});
const RING = 2 * Math.PI * 17;

export function Approve({
  action,
  details = [],
  agent,
  undo = true,
  undoFor,
  risk = "normal",
  hold,
  approveLabel,
  denyLabel = "Not now",
  onApprove,
  onDeny,
  onUndo,
  status: held,
  color: colorProp,
  className,
  style,
}: ApproveProps) {
  const theme = useTheme();
  const reduced = useReducedMotion() ?? false;
  const pace = theme.pace ?? 1;
  const high = risk === "high";
  const color = colorProp ?? (high ? "#ef4444" : (theme.accent ?? "#3d7bff"));
  const length = hold ?? (high ? 1600 : 900);

  const [own, setOwn] = useState<ApproveStatus>("waiting");
  const status = held ?? own;
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);

  // The button it was focused on goes away once it is approved, so the
  // focus moves on to the receipt instead of falling back to the page.
  useEffect(() => {
    if (status === "waiting") return;
    const frame = requestAnimationFrame(() => {
      const here = box.current;
      if (
        !here ||
        (document.activeElement && document.activeElement !== document.body)
      )
        return;
      here
        .querySelector<HTMLElement>('[role="status"]')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [status]);
  const [pointing, setPointing] = useState(false);
  const [holding, setHolding] = useState(false);
  const [landed, setLanded] = useState(0);

  // How full the ring is, from 0 to 1 while held.
  const progress = useMotionValue(0);
  const dash = useMotionValue(RING);
  useEffect(
    () => progress.on("change", (value) => dash.set(RING * (1 - value))),
    [progress, dash],
  );
  const run = useRef<AnimationPlaybackControls | null>(null);
  useEffect(() => () => run.current?.stop(), []);

  const approve = async () => {
    setFailed(false);
    setLanded((n) => n + 1);
    if (typeof navigator !== "undefined") navigator.vibrate?.(12);
    // A beat on the full ring before it folds away.
    await new Promise((done) => setTimeout(done, reduced ? 0 : 280));
    const result = onApprove?.();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setOwn("running");
      try {
        await result;
        setOwn("done");
      } catch {
        progress.set(0);
        setLanded(0);
        setFailed(true);
        setOwn("waiting");
      }
    } else setOwn("done");
  };

  const press = () => {
    if (status !== "waiting" || holding || landed) return;
    if (length <= 0) return void approve();
    setHolding(true);
    run.current?.stop();
    run.current = animate(progress, 1, {
      duration: ((1 - progress.get()) * length) / 1000,
      ease: "linear",
      onComplete: () => {
        setHolding(false);
        void approve();
      },
    });
  };
  // Let go too soon and the ring runs back.
  const release = () => {
    if (!holding) return;
    setHolding(false);
    run.current?.stop();
    run.current = animate(progress, 0, { duration: 0.3 / pace, ease: EASE });
  };
  const keyDown = (event: KeyboardEvent) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      press();
    }
  };
  const keyUp = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") release();
  };

  const deny = () => {
    release();
    setOwn("denied");
    onDeny?.();
  };

  const undoText =
    typeof undo === "string"
      ? undo
      : undo
        ? undoFor
          ? `Undo for ${undoFor} seconds`
          : "Can be undone"
        : "Can't be undone";
  const prompt = approveLabel ?? (length > 0 ? "Hold to approve" : "Approve");
  // The line under the action doubles as the button's caption.
  const caption = holding ? "Keep holding" : pointing ? prompt : null;

  const plain = {
    border: 0,
    background: "none",
    padding: 0,
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
  } as const;

  return (
    <motion.div
      ref={box}
      layout
      transition={{ layout: { duration: 0.35 / pace, ease: EASE } }}
      className={className}
      style={{
        boxSizing: "border-box",
        width: "fit-content",
        maxWidth: "100%",
        overflow: "hidden",
        borderRadius: status === "waiting" ? rounded(24, theme) : 9999,
        background: "color-mix(in oklab, currentColor 5%, transparent)",
        fontSize: 14,
        lineHeight: 1.35,
        textAlign: "left",
        ...style,
      }}
    >
      <style>{SHINE}</style>
      <AnimatePresence mode="popLayout" initial={false}>
        {status === "waiting" ? (
          <motion.div
            key="ask"
            layout="position"
            style={{ padding: "6px 6px 6px 16px" }}
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{
              opacity: 0,
              filter: "blur(4px)",
              transition: { duration: 0.15 / pace },
            }}
            transition={{ duration: 0.25 / pace, ease: EASE }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <p style={{ margin: 0, fontWeight: 500 }}>
                  {agent && (
                    <span style={{ opacity: 0.5, fontWeight: 400 }}>
                      {agent}{" "}
                    </span>
                  )}
                  {action}
                </p>

                {/* Under the action, whether it can be undone. Pointing at
                    the button, what to do with it. */}
                <div
                  style={{
                    position: "relative",
                    height: "1.4em",
                    marginTop: 1,
                    fontSize: "0.8em",
                  }}
                >
                  {/* The line below is drawn on top of the rest, so this
                      unseen copy holds its width and nothing gets cut off. */}
                  <span
                    aria-hidden="true"
                    style={{
                      display: "flex",
                      gap: 6,
                      height: 0,
                      overflow: "hidden",
                      visibility: "hidden",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>{undoText}</span>
                    {details.length > 0 && (
                      <>
                        <span style={{ width: 3 }} />
                        <span style={{ paddingRight: 11 }}>What happens</span>
                      </>
                    )}
                  </span>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {caption ? (
                      <motion.span
                        key="caption"
                        style={{
                          position: "absolute",
                          whiteSpace: "nowrap",
                          color,
                          ...(holding && !reduced ? shine(1.2 / pace) : null),
                        }}
                        initial={{ opacity: 0, y: 5, filter: "blur(2px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -5, filter: "blur(2px)" }}
                        transition={{ duration: 0.18 / pace, ease: EASE }}
                      >
                        {caption}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="meta"
                        style={{
                          position: "absolute",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          whiteSpace: "nowrap",
                        }}
                        initial={{ opacity: 0, y: 5, filter: "blur(2px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -5, filter: "blur(2px)" }}
                        transition={{ duration: 0.18 / pace, ease: EASE }}
                      >
                        <span
                          style={
                            undo === false
                              ? { color: "#f5a524" }
                              : { opacity: 0.5 }
                          }
                        >
                          {undoText}
                        </span>
                        {details.length > 0 && (
                          <>
                            <Dot />
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={`${id}-details`}
                              onClick={() => setOpen((now) => !now)}
                              style={{
                                ...plain,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                opacity: open ? 0.8 : 0.5,
                                transition: "opacity 150ms ease-out",
                              }}
                            >
                              What happens
                              <motion.svg
                                aria-hidden="true"
                                width="8"
                                height="8"
                                viewBox="0 0 8 8"
                                animate={{ rotate: open ? 180 : 0 }}
                                transition={{
                                  duration: 0.25 / pace,
                                  ease: EASE,
                                }}
                              >
                                <path
                                  d="M1.5 3 4 5.5 6.5 3"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </motion.svg>
                            </button>
                          </>
                        )}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  flexShrink: 0,
                }}
              >
                <motion.button
                  type="button"
                  onClick={deny}
                  aria-label={`${denyLabel}, ${action}`}
                  title={denyLabel}
                  initial={{ opacity: 0.45 }}
                  whileHover={{ opacity: 0.9 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    ...plain,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: 9999,
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                  >
                    <path
                      d="M3 3l6 6M9 3l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.button>

                <HoldButton
                  label={`${prompt}, ${action}`}
                  color={color}
                  holding={holding}
                  landed={landed}
                  dash={dash}
                  reduced={reduced}
                  pace={pace}
                  onPress={press}
                  onRelease={release}
                  onKeyDown={keyDown}
                  onKeyUp={keyUp}
                  onPoint={setPointing}
                />
              </div>
            </div>

            <AnimatePresence initial={false}>
              {open && (
                <motion.ul
                  id={`${id}-details`}
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: "0 44px 0 0",
                    overflow: "hidden",
                    fontSize: "0.86em",
                  }}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: "auto",
                    opacity: 1,
                    transition: { duration: 0.25 / pace, ease: EASE },
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: { duration: 0.15 / pace, ease: EASE },
                  }}
                >
                  {details.map((line, i) => (
                    <motion.li
                      key={line}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        paddingTop: i ? 4 : 8,
                        paddingBottom: i === details.length - 1 ? 6 : 0,
                      }}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 0.7, y: 0 }}
                      transition={{
                        duration: 0.25 / pace,
                        ease: EASE,
                        delay: (0.04 + i * 0.04) / pace,
                      }}
                    >
                      <Dot />
                      {line}
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {failed && (
                <motion.p
                  role="alert"
                  style={{
                    margin: 0,
                    overflow: "hidden",
                    fontSize: "0.8em",
                    color: "#ef4444",
                  }}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1, paddingBottom: 6 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  That did not go through. Hold again to retry.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <Receipt
            key="receipt"
            status={status}
            action={action}
            color={color}
            pace={pace}
            undoable={undo !== false && !!onUndo}
            undoFor={undoFor}
            onUndo={() => {
              setOwn("undone");
              onUndo?.();
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * The round button. A thin ring round it fills while it is held, then the
 * arrow turns into a tick and the ring sends out one soft pulse.
 */
function HoldButton({
  label,
  color,
  holding,
  landed,
  dash,
  reduced,
  pace,
  onPress,
  onRelease,
  onKeyDown,
  onKeyUp,
  onPoint,
}: {
  label: string;
  color: string;
  holding: boolean;
  landed: number;
  dash: MotionValue<number>;
  reduced: boolean;
  pace: number;
  onPress: () => void;
  onRelease: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  onPoint: (pointing: boolean) => void;
}) {
  const done = landed > 0;
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPress}
      onPointerUp={onRelease}
      onPointerEnter={() => onPoint(true)}
      onPointerLeave={() => {
        onPoint(false);
        onRelease();
      }}
      onPointerCancel={onRelease}
      onFocus={() => onPoint(true)}
      onBlur={() => {
        onPoint(false);
        onRelease();
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        border: 0,
        padding: 0,
        background: "none",
        color: "inherit",
        cursor: "pointer",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* The ring, a faint track and the part already held */}
      <svg
        aria-hidden="true"
        viewBox="0 0 40 40"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeWidth="2"
        />
        <g transform="rotate(-90 20 20)">
          <motion.circle
            cx="20"
            cy="20"
            r="17"
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={RING}
            style={{ strokeDashoffset: dash }}
          />
        </g>
      </svg>

      {/* One soft pulse the moment it lands */}
      <AnimatePresence>
        {done && !reduced && (
          <motion.span
            key={landed}
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 3,
              borderRadius: 9999,
              border: `2px solid ${color}`,
            }}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 0.6 / pace, ease: EASE }}
          />
        )}
      </AnimatePresence>

      <motion.span
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          borderRadius: 9999,
          background: color,
          color: "#ffffff",
        }}
        animate={{ scale: holding ? 0.86 : done ? [1, 1.12, 1] : 1 }}
        transition={
          holding
            ? { type: "spring", stiffness: 380, damping: 26 }
            : { duration: 0.35 / pace, ease: EASE }
        }
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.path
                key="tick"
                d="M3 7.3 5.8 10 11 4.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.25 / pace, ease: EASE }}
              />
            ) : (
              <motion.path
                key="arrow"
                d="M7 11.5V2.8M3.4 6.3 7 2.7l3.6 3.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                animate={{ y: holding ? -1.2 : 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.25 / pace, ease: EASE }}
              />
            )}
          </AnimatePresence>
        </svg>
      </motion.span>
    </button>
  );
}

/** What it came to, on one line, with an Undo that runs out. */
function Receipt({
  status,
  action,
  color,
  pace,
  undoable,
  undoFor,
  onUndo,
}: {
  status: ApproveStatus;
  action: string;
  color: string;
  pace: number;
  undoable: boolean;
  undoFor?: number;
  onUndo: () => void;
}) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (status !== "done" || !undoFor) return;
    const timer = setTimeout(() => setExpired(true), undoFor * 1000);
    return () => clearTimeout(timer);
  }, [status, undoFor]);
  const good = status === "done" || status === "running";
  const quiet = status === "denied" || status === "undone";
  const word =
    status === "running"
      ? "Working on it"
      : status === "done"
        ? "Approved"
        : status === "undone"
          ? "Undone"
          : "Not approved";

  return (
    <motion.div
      layout="position"
      role="status"
      tabIndex={-1}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 8px 6px 7px",
        outline: "none",
      }}
      initial={{ opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: quiet ? 0.6 : 1, filter: "blur(0px)" }}
      exit={{
        opacity: 0,
        filter: "blur(4px)",
        transition: { duration: 0.15 / pace },
      }}
      transition={{ duration: 0.25 / pace, ease: EASE }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: 9999,
          background: good
            ? color
            : "color-mix(in oklab, currentColor 10%, transparent)",
          color: good ? "#ffffff" : "inherit",
        }}
      >
        {status === "running" ? (
          // Turns as a whole, so it spins about its own middle
          <motion.svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            style={{ display: "block" }}
          >
            <circle
              cx="6"
              cy="6"
              r="4.2"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeWidth="1.6"
            />
            <path
              d="M6 1.8a4.2 4.2 0 0 1 4.2 4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </motion.svg>
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            style={{ display: "block" }}
          >
            <motion.path
              key={status}
              d={
                status === "done"
                  ? "M2.6 6.3 5 8.6 9.4 3.8"
                  : status === "undone"
                    ? "M3.5 4.5h3.8a2 2 0 0 1 0 4H5.4M3.5 4.5l1.8-1.8M3.5 4.5l1.8 1.8"
                    : "M3.5 3.5l5 5M8.5 3.5l-5 5"
              }
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3 / pace, ease: EASE, delay: 0.05 }}
            />
          </svg>
        )}
      </span>

      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={word}
            style={{
              display: "inline-block",
              fontWeight: 500,
              ...(status === "running" ? shine(1.6 / pace) : null),
            }}
            initial={{ opacity: 0, y: 5, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -5, filter: "blur(2px)" }}
            transition={{ duration: 0.18 / pace, ease: EASE }}
          >
            {word}
          </motion.span>
        </AnimatePresence>
        <span style={{ opacity: 0.5 }}> {action}</span>
      </span>

      <AnimatePresence initial={false}>
        {status === "done" && undoable && !expired && (
          <motion.button
            type="button"
            onClick={onUndo}
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 26,
              marginLeft: 4,
              padding: undoFor ? "0 10px 0 8px" : "0 10px",
              border: 0,
              borderRadius: 9999,
              background: "color-mix(in oklab, currentColor 7%, transparent)",
              color: "inherit",
              font: "inherit",
              fontSize: "0.86em",
              fontWeight: 500,
              cursor: "pointer",
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 / pace, ease: EASE, delay: 0.15 }}
          >
            {undoFor ? (
              // A ring that empties as the time to undo runs out
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 12 12"
              >
                <circle
                  cx="6"
                  cy="6"
                  r="4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.2"
                  strokeWidth="1.6"
                />
                <g transform="rotate(-90 6 6)">
                  <motion.circle
                    cx="6"
                    cy="6"
                    r="4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    initial={{ pathLength: 1 }}
                    animate={{ pathLength: 0 }}
                    transition={{ duration: undoFor, ease: "linear" }}
                  />
                </g>
              </svg>
            ) : null}
            Undo
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** A small dot between bits of text. */
function Dot() {
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: 3,
        height: 3,
        borderRadius: 9999,
        background: "currentColor",
        opacity: 0.3,
      }}
    />
  );
}
