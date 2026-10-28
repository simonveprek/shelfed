"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { rounded, useTheme } from "./theme";

/**
 * Plan. An agent's to do list that ticks itself off as it works. Steps
 * arrive one by one, the one it is on shimmers, and the finished ones fold
 * away into a single line, so the list never outgrows the answer around it.
 * Needs React and Framer Motion. No Tailwind required. It takes its colours
 * from the text around it.
 *
 *   <Plan
 *     title="Fixing the login bug"
 *     steps={[
 *       { title: "Read the auth flow", status: "done" },
 *       { title: "Find why sessions expire", status: "active", detail: "Reading session.ts" },
 *       { title: "Patch the refresh" },
 *     ]}
 *   />
 *
 * Fragms 2.1.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type PlanStatus = "pending" | "active" | "done" | "failed" | "skipped";

export type PlanStep = {
  /** Keeps a step in place when the list changes. Left out, its title. */
  id?: string;
  title: string;
  /** A line under the step while it is being worked on, like what it reads. */
  detail?: string;
  status?: PlanStatus;
};

export type PlanProps = {
  steps: PlanStep[];
  /** What the plan is for, over the list. */
  title?: string;
  /** Folds finished steps into one line once this many are done. 0 never folds. */
  fold?: number;
  /** A circle that fills with a tick, the step's number, or a small dot. */
  marker?: "check" | "number" | "dot";
  /** Shows how far along it is, as a thin bar under the title. */
  progress?: boolean;
  /** The colour of progress and of the step being worked on. Left out, the theme's accent. */
  color?: string;
  className?: string;
  style?: CSSProperties;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const FAILED = "#ef4444";
const tint = (share: number) =>
  `color-mix(in oklab, currentColor ${share}%, transparent)`;

export function Plan({
  steps,
  title,
  fold = 3,
  marker = "check",
  progress = true,
  color,
  className,
  style,
}: PlanProps) {
  const theme = useTheme();
  const pace = theme.pace ?? 1;
  const accent = color ?? theme.accent ?? "#3d7bff";
  const [unfolded, setUnfolded] = useState(false);

  const done = steps.filter(
    (step) => step.status === "done" || step.status === "skipped",
  ).length;
  const share = steps.length ? done / steps.length : 0;
  // Finished steps before the one being worked on fold into a single line.
  const firstOpen = steps.findIndex(
    (step) => step.status !== "done" && step.status !== "skipped",
  );
  const leading = firstOpen === -1 ? steps.length : firstOpen;
  const folding = fold > 0 && leading >= fold && !unfolded;
  const shown = folding ? steps.slice(leading) : steps;
  const finished = done === steps.length && steps.length > 0;

  return (
    <div
      className={className}
      style={{
        boxSizing: "border-box",
        width: "100%",
        padding: "16px 18px 12px",
        borderRadius: rounded(24, theme),
        background: tint(5),
        fontFamily: theme.font,
        fontSize: 14,
        lineHeight: 1.45,
        ...style,
      }}
    >
      {(title || progress) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            {title && (
              <span style={{ fontWeight: 600, minWidth: 0, flex: 1 }}>
                {title}
              </span>
            )}
            <span
              aria-hidden="true"
              style={{
                marginLeft: "auto",
                fontSize: 12,
                opacity: 0.5,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {finished ? "All done" : `${done} of ${steps.length}`}
            </span>
          </div>
          {progress && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={done}
              aria-label={title ?? "Plan"}
              style={{
                position: "relative",
                height: 3,
                marginTop: 9,
                borderRadius: 9999,
                overflow: "hidden",
                background: tint(10),
              }}
            >
              <motion.span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 9999,
                  background: accent,
                  transformOrigin: "left",
                }}
                initial={false}
                animate={{ scaleX: share }}
                transition={{ duration: 0.6 / pace, ease: EASE }}
              />
            </div>
          )}
        </div>
      )}

      <ol
        aria-live="polite"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <AnimatePresence initial={false}>
          {folding && (
            <motion.li
              key="folded"
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 / pace, ease: EASE }}
            >
              <button
                type="button"
                onClick={() => setUnfolded(true)}
                aria-label={`Show the ${leading} finished steps`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "6px 6px",
                  margin: "0 -6px",
                  boxSizing: "content-box",
                  border: 0,
                  borderRadius: rounded(10, theme),
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                  opacity: 0.55,
                }}
              >
                <Marker
                  status="done"
                  marker={marker}
                  index={leading - 1}
                  accent={accent}
                  pace={pace}
                />
                <span>
                  {leading} {leading === 1 ? "step" : "steps"} done
                </span>
                <Chevron />
              </button>
            </motion.li>
          )}
          {shown.map((step) => {
            const index = steps.indexOf(step);
            return (
              <Row
                key={step.id ?? step.title}
                step={step}
                index={index}
                marker={marker}
                accent={accent}
                pace={pace}
              />
            );
          })}
        </AnimatePresence>
      </ol>

      {unfolded && fold > 0 && leading >= fold && (
        <button
          type="button"
          onClick={() => setUnfolded(false)}
          style={{
            marginTop: 6,
            padding: 0,
            border: 0,
            background: "transparent",
            color: "inherit",
            font: "inherit",
            fontSize: 12,
            opacity: 0.5,
            cursor: "pointer",
          }}
        >
          Fold finished steps
        </button>
      )}
    </div>
  );
}

function Row({
  step,
  index,
  marker,
  accent,
  pace,
}: {
  step: PlanStep;
  index: number;
  marker: NonNullable<PlanProps["marker"]>;
  accent: string;
  pace: number;
}) {
  const status = step.status ?? "pending";
  const active = status === "active";
  const quiet = status === "done" || status === "skipped";
  return (
    <motion.li
      layout="position"
      aria-current={active ? "step" : undefined}
      aria-label={`${step.title}, ${WORD[status]}`}
      initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{
        opacity: 0,
        height: 0,
        filter: "blur(4px)",
        transition: { duration: 0.25 / pace, ease: EASE },
      }}
      transition={{ duration: 0.4 / pace, ease: EASE }}
      style={{ display: "flex", gap: 10, padding: "5px 0" }}
    >
      <Marker
        status={status}
        marker={marker}
        index={index}
        accent={accent}
        pace={pace}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Title active={active} pace={pace}>
          <span
            style={{
              opacity: quiet ? 0.5 : status === "pending" ? 0.72 : 1,
              textDecoration: status === "skipped" ? "line-through" : undefined,
              color: status === "failed" ? FAILED : undefined,
              transition: "opacity 300ms ease",
            }}
          >
            {step.title}
          </span>
        </Title>
        <AnimatePresence initial={false}>
          {step.detail && (active || status === "failed") && (
            <motion.p
              key={step.detail}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 0.55, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 / pace, ease: EASE }}
              style={{ margin: "1px 0 0", fontSize: 12.5, overflow: "hidden" }}
            >
              {step.detail}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

const WORD: Record<PlanStatus, string> = {
  pending: "to do",
  active: "in progress",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};

/** The step being worked on, with light passing slowly over its words. */
function Title({
  active,
  pace,
  children,
}: {
  active: boolean;
  pace: number;
  children: ReactNode;
}) {
  if (!active) return <div>{children}</div>;
  return (
    <motion.div
      style={{
        fontWeight: 500,
        backgroundImage: `linear-gradient(90deg, currentColor 0%, currentColor 40%, ${tint(30)} 50%, currentColor 60%, currentColor 100%)`,
        backgroundSize: "250% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}
      animate={{ backgroundPosition: ["100% 0%", "-150% 0%"] }}
      transition={{ duration: 1.8 / pace, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.div>
  );
}

/** The mark beside a step, for each state it can be in. */
function Marker({
  status,
  marker,
  index,
  accent,
  pace,
}: {
  status: PlanStatus;
  marker: NonNullable<PlanProps["marker"]>;
  index: number;
  accent: string;
  pace: number;
}) {
  const size = 18;
  const box: CSSProperties = {
    position: "relative",
    flexShrink: 0,
    width: size,
    height: size,
    marginTop: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  if (status === "active")
    return (
      <span aria-hidden="true" style={box}>
        <svg width={size} height={size} viewBox="0 0 18 18">
          <circle
            cx="9"
            cy="9"
            r="7"
            fill="none"
            stroke={tint(14)}
            strokeWidth="2"
          />
        </svg>
        {/* The arc turns as a whole, around the middle of the circle */}
        <motion.svg
          width={size}
          height={size}
          viewBox="0 0 18 18"
          style={{ position: "absolute", inset: 0 }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 0.9 / pace,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <circle
            cx="9"
            cy="9"
            r="7"
            fill="none"
            stroke={accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="12 32"
          />
        </motion.svg>
      </span>
    );

  if (status === "done" || status === "failed") {
    const fill = status === "failed" ? FAILED : accent;
    return (
      <span aria-hidden="true" style={box}>
        <motion.span
          style={{
            position: "absolute",
            inset: 1,
            borderRadius: 9999,
            background: fill,
          }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.45 / pace, bounce: 0.4 }}
        />
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          style={{ position: "relative" }}
        >
          <motion.path
            d={
              status === "failed"
                ? "M6 6 18 18 M18 6 6 18"
                : "M5 12.5 10 17.5 19 7"
            }
            fill="none"
            stroke="#fff"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: 0.35 / pace,
              ease: EASE,
              delay: 0.08 / pace,
            }}
          />
        </svg>
      </span>
    );
  }

  if (status === "skipped")
    return (
      <span aria-hidden="true" style={box}>
        <span
          style={{
            width: 8,
            height: 2,
            borderRadius: 9999,
            background: tint(35),
          }}
        />
      </span>
    );

  // Waiting its turn.
  if (marker === "number")
    return (
      <span
        aria-hidden="true"
        style={{
          ...box,
          borderRadius: 9999,
          boxShadow: `inset 0 0 0 1.5px ${tint(22)}`,
          fontSize: 10.5,
          fontWeight: 600,
          opacity: 0.7,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {index + 1}
      </span>
    );
  if (marker === "dot")
    return (
      <span aria-hidden="true" style={box}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 9999,
            background: tint(30),
          }}
        />
      </span>
    );
  return (
    <span aria-hidden="true" style={box}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 9999,
          boxShadow: `inset 0 0 0 1.5px ${tint(24)}`,
        }}
      />
    </span>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginLeft: "auto" }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
