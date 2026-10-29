import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AURORA } from "@/components/ui";

/**
 * Shelfed's mark, drawn the Fragms way on its 32 grid. Two plain spines and
 * one alive, the book you are reading, leaning on the others in the aurora.
 * The spines stand up on arrival, then the last one tips over and glows.
 */
export function Mark({ size = 26, animate = true, className = "" }: { size?: number; animate?: boolean; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  const id = `shelf-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const play = animate && !reduced;
  const spines = [
    { x: 2.5, y: 3, h: 26 },
    { x: 11.5, y: 8, h: 21 },
  ];
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className={`group/mark overflow-visible ${className}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {AURORA.map((color, i) => (
            <stop key={color} offset={i / 3} stopColor={color} />
          ))}
          {play && <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="9s" repeatCount="indefinite" />}
        </linearGradient>
      </defs>
      {spines.map((s, i) => (
        <motion.rect
          key={i}
          x={s.x}
          y={s.y}
          width="7"
          height={s.h}
          rx="3"
          fill="currentColor"
          // On SVG, Framer measures the origin from the shape's own box, so this is its bottom middle.
          style={{ originX: 0.5, originY: 1 }}
          initial={play ? { scaleY: 0, opacity: 0 } : false}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.6, bounce: 0.35, delay: 0.1 + i * 0.08 }}
        />
      ))}
      {/* The one that is alive */}
      <motion.g
        // It pivots on its bottom left corner, the one resting on the shelf.
        style={{ originX: 0, originY: 1 }}
        initial={play ? { rotate: 0, scaleY: 0 } : { rotate: -16 }}
        animate={{ rotate: -16, scaleY: 1 }}
        transition={{
          scaleY: { type: "spring", duration: 0.6, bounce: 0.35, delay: 0.26 },
          rotate: { type: "spring", duration: 0.9, bounce: 0.45, delay: 0.6 },
        }}
      >
        <rect
          x="23.7"
          y="10"
          width="7"
          height="19"
          rx="3"
          fill={`url(#${id})`}
          className="transition-transform duration-300 group-hover/mark:-translate-y-[1.5px]"
        />
      </motion.g>
    </svg>
  );
}

/** The mark with its name, set the way Fragms sets its own. */
export function Logo({ name = "shelfed", animate = true, collapsed = false }: { name?: string; animate?: boolean; collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={24} animate={animate} className="shrink-0" />
      <span className={`text-[17px] leading-none font-medium tracking-[-0.03em] transition-opacity duration-150 ${collapsed ? "opacity-0" : ""}`}>{name}</span>
    </span>
  );
}
