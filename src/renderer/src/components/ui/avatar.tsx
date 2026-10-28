"use client";

import { useState } from "react";
import { cx } from "./cx";
import { Tooltip } from "./tooltip";

export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarStatus = "online" | "away" | "busy";

const SIZE: Record<AvatarSize, { box: number; text: string; dot: string }> = {
  xs: { box: 20, text: "text-[9px]", dot: "size-1.5" },
  sm: { box: 28, text: "text-[11px]", dot: "size-2" },
  md: { box: 36, text: "text-caption", dot: "size-2.5" },
  lg: { box: 48, text: "text-[15px]", dot: "size-3" },
};

const STATUS: Record<AvatarStatus, string> = {
  online: "bg-success",
  away: "bg-muted",
  busy: "bg-danger",
};

/** The first letters of the first two words, like SV. */
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/**
 * A person, as their photo or their initials. The initials show while there
 * is no photo or when it fails to load. A dot in the corner can say whether
 * they are around.
 */
export function Avatar({
  name,
  src,
  size = "md",
  status,
  className,
}: {
  /** Read out, and the initials come from it. */
  name: string;
  src?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
}) {
  // The photo fades in over the initials once it has loaded, so a slow or
  // broken one never shows. Both states are keyed to the address.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { box, text, dot } = SIZE[size];
  const photo = src && failed !== src ? src : null;
  // An image can finish before the page is interactive, so check it on mount.
  const settle = (node: HTMLImageElement | null) => {
    if (!node || !photo || !node.complete) return;
    if (node.naturalWidth > 0) setLoaded(photo);
    else setFailed(photo);
  };

  return (
    <span
      role="img"
      aria-label={status ? `${name}, ${status}` : name}
      className={cx("relative inline-flex shrink-0", className)}
      style={{ width: box, height: box }}
    >
      <span
        className={cx(
          "relative flex size-full items-center justify-center overflow-hidden rounded-full bg-control font-medium text-muted select-none",
          text,
        )}
      >
        <span aria-hidden="true">{initials(name)}</span>
        {photo && (
          // A plain image, so any address works without image settings.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo}
            ref={settle}
            src={photo}
            alt=""
            onLoad={() => setLoaded(photo)}
            onError={() => setFailed(photo)}
            className={cx(
              "absolute inset-0 size-full object-cover transition-opacity duration-250 ease-smooth",
              loaded === photo ? "opacity-100" : "opacity-0",
            )}
          />
        )}
      </span>
      {status && (
        <span
          aria-hidden="true"
          className={cx(
            "absolute right-0 bottom-0 rounded-full ring-2 ring-card",
            dot,
            STATUS[status],
          )}
        />
      )}
    </span>
  );
}

/**
 * A few people overlapping in a row, and how many more there are. They part
 * a little on hover, and each one says its name.
 */
export function AvatarGroup({
  people,
  max = 4,
  size = "md",
  className,
}: {
  people: { name: string; src?: string }[];
  /** How many faces before the rest become a count. */
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const { box, text } = SIZE[size];
  const overlap =
    size === "lg"
      ? "-ml-3 group-hover/avatars:-ml-2"
      : size === "xs"
        ? "-ml-1.5 group-hover/avatars:-ml-1"
        : "-ml-2 group-hover/avatars:-ml-1.5";
  const item = (i: number) =>
    cx(
      "rounded-full ring-2 ring-card transition-[margin] duration-250 ease-smooth",
      i > 0 && overlap,
    );

  return (
    <div className={cx("group/avatars flex items-center", className)}>
      {shown.map((person, i) => (
        <span key={`${person.name}-${i}`} className={cx("flex", item(i))}>
          <Tooltip content={person.name}>
            <Avatar name={person.name} src={person.src} size={size} />
          </Tooltip>
        </span>
      ))}
      {rest > 0 && (
        <span
          role="img"
          aria-label={`${rest} more`}
          className={cx(
            "flex shrink-0 items-center justify-center bg-control font-medium text-muted tabular-nums",
            text,
            item(shown.length),
          )}
          style={{ width: box, height: box }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
