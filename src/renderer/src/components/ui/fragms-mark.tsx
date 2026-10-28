"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useFirstArrival } from "./motion";

/** The aurora the live fragment glows with. */
export const AURORA = ["#2b4bff", "#a23bff", "#ff2d55", "#ffb020"];

/**
 * The Fragms mark. Four fragments, like a set of parts. Three are plain, one
 * is round and alive, the way a component stands out once it moves. On a
 * fresh visit the cells pop in, and the last one rounds off and starts to glow.
 */
export function FragmsMark({
  size = 28,
  animate = true,
  className = "",
}: {
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const first = useFirstArrival();
  const id = `fragms-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const play = animate && !reduced && first;
  const cells = [
    { x: 3, y: 3 },
    { x: 3, y: 17 },
    { x: 17, y: 17 },
  ];

  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className={`group/mark overflow-visible ${className}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {AURORA.map((color, i) => (
            <stop key={color} offset={i / 3} stopColor={color} />
          ))}
          {animate && !reduced && (
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              from="0 0.5 0.5"
              to="360 0.5 0.5"
              dur="9s"
              repeatCount="indefinite"
            />
          )}
        </linearGradient>
      </defs>

      {cells.map((cell, i) => (
        <motion.rect
          key={i}
          x={cell.x}
          y={cell.y}
          width="12"
          height="12"
          rx="3.5"
          fill="currentColor"
          style={{ transformOrigin: `${cell.x + 6}px ${cell.y + 6}px` }}
          initial={play ? { scale: 0, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.6, bounce: 0.35, delay: 0.1 + i * 0.08 }}
        />
      ))}

      {/* The one that is alive */}
      <motion.rect
        x="17"
        y="3"
        width="12"
        height="12"
        fill={`url(#${id})`}
        className="transition-transform duration-300 group-hover/mark:-translate-y-[1.5px]"
        style={{ transformOrigin: "23px 9px" }}
        initial={play ? { scale: 0, rx: 3.5, rotate: -90 } : { rx: 6 }}
        animate={{ scale: 1, rx: 6, rotate: 0 }}
        transition={{
          scale: { type: "spring", duration: 0.7, bounce: 0.45, delay: 0.38 },
          rotate: { type: "spring", duration: 0.9, bounce: 0.3, delay: 0.38 },
          rx: { duration: 0.5, delay: 0.75, ease: [0.22, 1, 0.36, 1] },
        }}
      />
    </svg>
  );
}

/** The mark with a name, set the Fragms way. */
export function FragmsLogo({ name = "fragms", animate = true }: { name?: string; animate?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <FragmsMark size={26} animate={animate} />
      <span className="text-[17px] leading-none font-medium tracking-[-0.03em]">{name}</span>
    </span>
  );
}
