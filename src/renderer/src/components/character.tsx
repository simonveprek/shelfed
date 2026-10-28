"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Point } from "@/components/fragms/points";
import { POINT_COLORS, type PointMood, type PointShape } from "@/components/fragms/points-data";

/*
 * Points for pages. These live on the client, so a server page can pick a
 * colour by name and the Point still gets the real colour.
 */

/** A Point by shape, colour name and mood. Left out, the colour is the brand accent. */
export type Character = {
  shape?: PointShape;
  color?: keyof typeof POINT_COLORS;
  mood?: PointMood;
};

export function CharacterPoint({
  shape,
  color,
  mood,
  ...rest
}: Character & Omit<ComponentProps<typeof Point>, "color" | "shape" | "mood">) {
  return <Point shape={shape} color={color ? POINT_COLORS[color] : undefined} mood={mood} {...rest} />;
}

/** A small Point that says hello with a hop, then follows the pointer. */
export function Greeting({ shape = "flower", size = 40 }: { shape?: PointShape; size?: number }) {
  const [hello, setHello] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setHello(false), 1400);
    return () => clearTimeout(timer);
  }, []);
  return <Point shape={shape} mood={hello ? "happy" : "idle"} look="pointer" size={size} />;
}
