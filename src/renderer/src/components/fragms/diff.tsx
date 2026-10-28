"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { rounded, useTheme } from "./theme";

/**
 * Diff. An agent proposes a change and you review it where it stands. Lines
 * it takes out are red, lines it adds are green, the words that changed are
 * marked inside them, and each change can be accepted or kept as it was,
 * with an undo. Needs React and Framer Motion. No Tailwind required. It takes
 * its colours from the text around it.
 *
 *   <Diff
 *     file="src/auth/session.ts"
 *     before={oldCode}
 *     after={newCode}
 *     onResolve={(merged) => save(merged)}
 *   />
 *
 * Fragms 2.1.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

export type DiffDecision = "pending" | "accepted" | "rejected";

export type DiffProps = {
  /** The text as it is now. */
  before: string;
  /** The text the agent proposes. */
  after: string;
  /** The file's path or name, over the changes. */
  file?: string;
  /** Unchanged lines kept around each change. The rest fold away. */
  context?: number;
  /** Shows Accept and Keep on each change. Off, it is a plain diff to read. */
  review?: boolean;
  /** Called whenever a decision changes, with the text as decided so far. */
  onChange?: (merged: string, decisions: DiffDecision[]) => void;
  /** Called once every change has a decision, with the final text. */
  onResolve?: (merged: string, decisions: DiffDecision[]) => void;
  /** The colour of Accept. Left out, the theme's accent. */
  color?: string;
  className?: string;
  style?: CSSProperties;
};

type Op =
  | { type: "same"; text: string; a: number; b: number }
  | { type: "del"; text: string; a: number; change: number }
  | { type: "add"; text: string; b: number; change: number };

const EASE = [0.22, 1, 0.36, 1] as const;
const ADD = "#22b573";
const DEL = "#ef4444";
const MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const tint = (share: number) =>
  `color-mix(in oklab, currentColor ${share}%, transparent)`;
const wash = (color: string, share: number) =>
  `color-mix(in oklab, ${color} ${share}%, transparent)`;

export function Diff({
  before,
  after,
  file,
  context = 2,
  review = true,
  onChange,
  onResolve,
  color,
  className,
  style,
}: DiffProps) {
  const theme = useTheme();
  const pace = theme.pace ?? 1;
  const accent = color ?? theme.accent ?? "#3d7bff";
  const ops = useMemo(() => diffLines(before, after), [before, after]);
  const changes = useMemo(
    () => Math.max(0, ...ops.map((op) => ("change" in op ? op.change + 1 : 0))),
    [ops],
  );
  const [decisions, setDecisions] = useState<DiffDecision[]>(() =>
    Array(changes).fill("pending"),
  );
  // A new proposal starts over.
  const [seenOps, setSeenOps] = useState(ops);
  if (seenOps !== ops) {
    setSeenOps(ops);
    setDecisions(Array(changes).fill("pending"));
  }

  const decide = (index: number | "all", decision: DiffDecision) =>
    setDecisions((now) =>
      now.map((current, i) =>
        index === "all"
          ? current === "pending"
            ? decision
            : current
          : i === index
            ? decision
            : current,
      ),
    );

  // Hands the merged text back as decisions change, and once at the end.
  const callbacks = useRef({ onChange, onResolve });
  useEffect(() => {
    callbacks.current = { onChange, onResolve };
  });
  const announced = useRef(false);
  useEffect(() => {
    if (!review) return;
    const text = merge(ops, decisions);
    callbacks.current.onChange?.(text, decisions);
    const done =
      decisions.length > 0 && decisions.every((d) => d !== "pending");
    if (done && !announced.current)
      callbacks.current.onResolve?.(text, decisions);
    announced.current = done;
  }, [decisions, ops, review]);

  const added = ops.filter((op) => op.type === "add").length;
  const removed = ops.filter((op) => op.type === "del").length;
  const pending = decisions.filter((d) => d === "pending").length;
  const accepted = decisions.filter((d) => d === "accepted").length;
  const rows = layout(ops, context);
  const pairs = useMemo(() => wordPairs(ops), [ops]);

  return (
    <div
      className={className}
      style={{
        boxSizing: "border-box",
        width: "100%",
        padding: 6,
        borderRadius: rounded(24, theme),
        background: tint(5),
        fontFamily: theme.font,
        fontSize: 13.5,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 6px 10px 12px",
        }}
      >
        <svg
          aria-hidden="true"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.5, flexShrink: 0 }}
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: MONO,
            fontSize: 12.5,
          }}
        >
          {file ?? "Proposed change"}
        </span>
        <span
          style={{
            display: "flex",
            gap: 6,
            fontFamily: MONO,
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          <span style={{ color: ADD }}>+{added}</span>
          <span style={{ color: DEL }}>−{removed}</span>
        </span>
        {review && changes > 0 && (
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {pending > 0 ? (
                <motion.span
                  key="actions"
                  style={{ display: "flex", gap: 6 }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 / pace, ease: EASE }}
                >
                  {changes > 1 && (
                    <>
                      <Action
                        onClick={() => decide("all", "rejected")}
                        theme={theme}
                      >
                        Keep all
                      </Action>
                      <Action
                        onClick={() => decide("all", "accepted")}
                        theme={theme}
                        strong={accent}
                      >
                        Accept all
                      </Action>
                    </>
                  )}
                </motion.span>
              ) : (
                <motion.span
                  key="done"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    opacity: 0.6,
                  }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 0.6, y: 0 }}
                  transition={{ duration: 0.3 / pace, ease: EASE }}
                >
                  <Tick color={accent} />
                  Reviewed
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        )}
      </div>

      <div
        role="table"
        aria-label={file ? `Changes to ${file}` : "Proposed changes"}
        style={{
          fontFamily: MONO,
          fontSize: 12.5,
          lineHeight: 1.7,
          overflowX: "auto",
          padding: "8px 0",
          borderRadius: rounded(18, theme),
          background: tint(5),
        }}
      >
        {rows.map((row, i) => {
          if (row.type === "gap")
            return (
              <div
                key={`gap-${i}`}
                role="row"
                style={{
                  padding: "2px 12px 2px 52px",
                  fontSize: 11.5,
                  opacity: 0.4,
                }}
              >
                {row.count} unchanged {row.count === 1 ? "line" : "lines"}
              </div>
            );
          const op = row.op;
          const change = "change" in op ? op.change : -1;
          const decision =
            change >= 0 ? (decisions[change] ?? "pending") : "pending";
          const gone =
            (op.type === "del" && decision === "accepted") ||
            (op.type === "add" && decision === "rejected");
          const settled = op.type !== "same" && decision !== "pending";
          const first = change >= 0 && isFirstOfChange(ops, op);
          return (
            <Fragment
              key={`${op.type}-${"a" in op ? op.a : ""}-${"b" in op ? op.b : ""}`}
            >
              {first && review && (
                <ChangeBar
                  decision={decision}
                  onDecide={(next) => decide(change, next)}
                  accent={accent}
                  theme={theme}
                  pace={pace}
                />
              )}
              <AnimatePresence initial={false}>
                {!gone && (
                  <motion.div
                    role="row"
                    aria-label={
                      op.type === "add"
                        ? "Added"
                        : op.type === "del"
                          ? "Removed"
                          : undefined
                    }
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 / pace, ease: EASE }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px 16px minmax(0, 1fr)",
                        background:
                          op.type === "same" || settled
                            ? "transparent"
                            : wash(op.type === "add" ? ADD : DEL, 11),
                        transition: "background 400ms ease",
                      }}
                    >
                      <span
                        style={{
                          textAlign: "right",
                          paddingRight: 8,
                          opacity: 0.3,
                          userSelect: "none",
                        }}
                      >
                        {op.type === "del" ? op.a + 1 : op.b + 1}
                      </span>
                      <span
                        style={{
                          userSelect: "none",
                          color: settled
                            ? undefined
                            : op.type === "add"
                              ? ADD
                              : op.type === "del"
                                ? DEL
                                : undefined,
                          opacity: op.type === "same" || settled ? 0.2 : 1,
                        }}
                      >
                        {op.type === "add"
                          ? "+"
                          : op.type === "del"
                            ? "−"
                            : " "}
                      </span>
                      <span
                        style={{
                          whiteSpace: "pre",
                          paddingRight: 12,
                          opacity: op.type === "same" ? 0.6 : 1,
                        }}
                      >
                        <Words
                          text={op.text}
                          marks={settled ? null : pairs.get(op)}
                          color={op.type === "add" ? ADD : DEL}
                        />
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Fragment>
          );
        })}
      </div>

      {review && changes > 0 && pending === 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3 / pace, ease: EASE }}
          style={{
            padding: "10px 12px 6px",
            fontSize: 12.5,
            opacity: 0.6,
          }}
        >
          {accepted === changes
            ? `All ${changes === 1 ? "" : `${changes} `}accepted`
            : accepted === 0
              ? "Kept as it was"
              : `${accepted} accepted, ${changes - accepted} kept as ${changes - accepted === 1 ? "it was" : "they were"}`}
        </motion.div>
      )}
    </div>
  );
}

/** The decision for one change, on a slim bar above its lines. */
function ChangeBar({
  decision,
  onDecide,
  accent,
  theme,
  pace,
}: {
  decision: DiffDecision;
  onDecide: (decision: DiffDecision) => void;
  accent: string;
  theme: ReturnType<typeof useTheme>;
  pace: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        fontFamily: theme.font,
        fontSize: 12,
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {decision === "pending" ? (
          <motion.span
            key="ask"
            style={{ display: "flex", gap: 6 }}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.2 / pace, ease: EASE }}
          >
            <Action onClick={() => onDecide("rejected")} theme={theme} small>
              Keep
            </Action>
            <Action
              onClick={() => onDecide("accepted")}
              theme={theme}
              strong={accent}
              small
            >
              Accept
            </Action>
          </motion.span>
        ) : (
          <motion.span
            key={decision}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.2 / pace, ease: EASE }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                opacity: 0.6,
              }}
            >
              {decision === "accepted" && <Tick color={accent} />}
              {decision === "accepted" ? "Accepted" : "Kept as it was"}
            </span>
            <button
              type="button"
              onClick={() => onDecide("pending")}
              style={{
                padding: 0,
                border: 0,
                background: "transparent",
                color: "inherit",
                font: "inherit",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationColor: tint(30),
                opacity: 0.6,
                cursor: "pointer",
              }}
            >
              Undo
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function Action({
  onClick,
  theme,
  strong,
  small,
  children,
}: {
  onClick: () => void;
  theme: ReturnType<typeof useTheme>;
  strong?: string;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      style={{
        height: small ? 24 : 28,
        padding: small ? "0 10px" : "0 12px",
        border: 0,
        borderRadius: rounded(9999, theme),
        background: strong ?? tint(8),
        color: strong ? "#fff" : "inherit",
        font: "inherit",
        fontFamily: theme.font,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </motion.button>
  );
}

function Tick({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 14,
        height: 14,
        borderRadius: 9999,
        background: color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="8" height="8" viewBox="0 0 24 24">
        <path
          d="M5 12.5 10 17.5 19 7"
          fill="none"
          stroke="#fff"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** A line, with the words that changed marked a shade deeper. */
function Words({
  text,
  marks,
  color,
}: {
  text: string;
  marks: boolean[] | null | undefined;
  color: string;
}) {
  if (!marks) return <>{text || " "}</>;
  const tokens = tokenize(text);
  return (
    <>
      {tokens.map((token, i) =>
        marks[i] ? (
          <span
            key={i}
            style={{ background: wash(color, 26), borderRadius: 3 }}
          >
            {token}
          </span>
        ) : (
          <Fragment key={i}>{token}</Fragment>
        ),
      )}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* The diff itself. Lines are matched by their longest common run, changes  */
/* are numbered, and long unchanged stretches fold to a count.              */
/* ------------------------------------------------------------------------ */

function lcs<T>(a: T[], b: T[]) {
  const table = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
  return table;
}

function diffLines(before: string, after: string): Op[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const table = lcs(a, b);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  let change = -1;
  let inChange = false;
  const open = () => {
    if (!inChange) {
      change += 1;
      inChange = true;
    }
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ type: "same", text: a[i], a: i, b: j });
      i += 1;
      j += 1;
      inChange = false;
    } else if (
      j >= b.length ||
      (i < a.length && table[i + 1][j] >= table[i][j + 1])
    ) {
      // On a tie the removal comes first, so a change reads top to bottom.
      open();
      ops.push({ type: "del", text: a[i], a: i, change });
      i += 1;
    } else {
      open();
      ops.push({ type: "add", text: b[j], b: j, change });
      j += 1;
    }
  }
  return ops;
}

type Row = { type: "line"; op: Op } | { type: "gap"; count: number };

function layout(ops: Op[], context: number): Row[] {
  const near = ops.map((op, index) =>
    op.type !== "same"
      ? true
      : ops
          .slice(Math.max(0, index - context), index + context + 1)
          .some((other) => other.type !== "same"),
  );
  const rows: Row[] = [];
  let hidden = 0;
  ops.forEach((op, index) => {
    if (near[index]) {
      if (hidden) rows.push({ type: "gap", count: hidden });
      hidden = 0;
      rows.push({ type: "line", op });
    } else hidden += 1;
  });
  if (hidden) rows.push({ type: "gap", count: hidden });
  return rows;
}

const isFirstOfChange = (ops: Op[], op: Op) => {
  const index = ops.indexOf(op);
  const previous = ops[index - 1];
  return (
    !previous ||
    !("change" in previous) ||
    !("change" in op) ||
    previous.change !== op.change
  );
};

/** The text with every accepted change applied and the rest as it was. */
function merge(ops: Op[], decisions: DiffDecision[]) {
  return ops
    .filter((op) =>
      op.type === "same"
        ? true
        : op.type === "add"
          ? decisions[op.change] === "accepted"
          : decisions[op.change] !== "accepted",
    )
    .map((op) => op.text)
    .join("\n");
}

const tokenize = (text: string) => text.split(/(\s+|[^\w\s])/).filter(Boolean);

/** For lines changed one for one, which of their words differ. */
function wordPairs(ops: Op[]) {
  const marks = new Map<Op, boolean[]>();
  const byChange = new Map<number, { del: Op[]; add: Op[] }>();
  for (const op of ops) {
    if (op.type === "same") continue;
    const group = byChange.get(op.change) ?? { del: [], add: [] };
    group[op.type].push(op);
    byChange.set(op.change, group);
  }
  for (const { del, add } of byChange.values()) {
    if (del.length !== add.length) continue;
    del.forEach((old, k) => {
      const a = tokenize(old.text);
      const b = tokenize(add[k].text);
      const table = lcs(a, b);
      const keepA = Array(a.length).fill(false);
      const keepB = Array(b.length).fill(false);
      let i = 0;
      let j = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
          keepA[i] = true;
          keepB[j] = true;
          i += 1;
          j += 1;
        } else if (table[i + 1][j] >= table[i][j + 1]) i += 1;
        else j += 1;
      }
      // Only worth marking when most of the line stayed the same.
      const same = keepB.filter(Boolean).length;
      if (same / Math.max(1, b.length) < 0.4) return;
      marks.set(
        old,
        keepA.map((kept, index) => !kept && /\S/.test(a[index])),
      );
      marks.set(
        add[k],
        keepB.map((kept, index) => !kept && /\S/.test(b[index])),
      );
    });
  }
  return marks;
}
