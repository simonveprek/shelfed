"use client";

import { Fragment, ViewTransition, useEffect, useState, type ElementType, type ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import { EASE } from "./cx";

/*
 * Fragms motion. Pages move with view transitions, sections play their
 * entrance as they scroll in, headings rise word by word. Everything opens
 * on the same smooth curve, and the CSS for page changes lives in
 * globals.css under "Page transitions".
 */

/** A section's children arrive one after another. */
export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** One child of a list. Transform and opacity only, so it stays smooth on phones. */
export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

/** Plays a section's entrance once it scrolls into view. Wrap children in <Item>. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0, margin: "0px 0px -40px 0px" }}
      variants={listVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** One piece of a Reveal, rising into place in turn. */
export function Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * A heading whose words rise out of a mask. Inside a Reveal it plays with
 * the section, on its own it plays on mount. travel names it, so the same
 * words on another page morph into it during a page change.
 */
export function SplitHeading({
  children,
  as: As = "h2",
  className = "",
  id,
  travel,
  play = "inherit",
}: {
  children: string;
  as?: ElementType;
  className?: string;
  id?: string;
  travel?: string;
  /** "inherit" waits for a parent Reveal, "mount" plays straight away. */
  play?: "inherit" | "mount";
}) {
  const words = children.split(" ");
  // The space sits between the masks. Inside one, a browser drops it.
  const inner = words.map((word, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span aria-hidden="true" className="inline-block overflow-hidden pb-[0.1em] align-bottom">
        <motion.span
          className="inline-block"
          variants={{
            hidden: { y: "110%", rotate: 4 },
            show: { y: "0%", rotate: 0, transition: { duration: 0.9, ease: EASE, delay: i * 0.07 } },
          }}
          {...(play === "mount" ? { initial: "hidden", animate: "show" } : {})}
        >
          {word}
        </motion.span>
      </span>
    </Fragment>
  ));
  return (
    <As id={id} className={className} aria-label={children}>
      {travel ? (
        <ViewTransition name={travel} share="vt-morph" default="none">
          <span className="inline-block">{inner}</span>
        </ViewTransition>
      ) : (
        inner
      )}
    </As>
  );
}

// Which motion each kind of navigation plays, see globals.css.
const PAGE = {
  "nav-forward": "vt-forward",
  "nav-back": "vt-back",
  "nav-deeper": "vt-deeper",
  "nav-up": "vt-up",
  default: "vt-fade",
};

/**
 * A whole page, moving however the navigation that reached it asks. It has
 * to be the outermost thing a page returns.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={PAGE} exit={PAGE} default="none">
      {children}
    </ViewTransition>
  );
}

/** Holds perfectly still while the page around it moves, like a header or a sidebar. */
export function Still({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="vt-still" default="none">
      {children}
    </ViewTransition>
  );
}

/** Travels between pages, like a name on a card becoming the next page's title. */
export function Travel({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="vt-morph" default="none">
      {children}
    </ViewTransition>
  );
}

// Whether the first page of this visit has shown. Entrances meant for a
// fresh load stay quiet after that, so they never fight a page change.
const visit = { arrived: false };

/** True only while the first page of a visit mounts. */
export function useFirstArrival() {
  const [first] = useState(() => !visit.arrived);
  useEffect(() => {
    visit.arrived = true;
  }, []);
  return first;
}
