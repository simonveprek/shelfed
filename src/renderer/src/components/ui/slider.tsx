"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatNumber, type NumberAffixes, type NumberFormat } from "./numbers";

type SliderProps = NumberAffixes & {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Shows a faint notch here, and a double click returns to it. */
  defaultValue?: number;
  /** Tighter rows, for small floating panels. */
  dense?: boolean;
  /** Decimals shown in the readout. */
  digits?: number;
  /** Writes the readout, by name from server pages or as a function. Wins over digits. */
  format?: NumberFormat;
  onChange: (value: number) => void;
};

const THUMB = 18;

/**
 * A slider with a slim track, a thumb that swells while held, and a notch for
 * the default. Works with the mouse, touch and the keyboard.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 0.05,
  defaultValue,
  dense = false,
  digits = 2,
  format,
  prefix,
  suffix,
  onChange,
}: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const ratio = (value - min) / (max - min);
  const notch =
    defaultValue === undefined ? null : (defaultValue - min) / (max - min);
  const decimals = (String(step).split(".")[1] ?? "").length;
  const readout = formatNumber(value, format ?? ((v) => v.toFixed(digits)), { prefix, suffix });

  const snap = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    return Number(
      (Math.round((clamped - min) / step) * step + min).toFixed(decimals + 1),
    );
  };

  function fromPointer(clientX: number) {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return;
    const position = (clientX - rect.left) / rect.width;
    onChange(snap(min + position * (max - min)));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    fromPointer(event.clientX);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragging) fromPointer(event.clientX);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const big = step * 4;
    const moves: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    onChange(snap(moves[event.key]));
  }

  return (
    <div>
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{label}</span>
        <span
          className={`text-[12px] tabular-nums transition-colors ${
            dragging ? "text-foreground" : ""
          }`}
        >
          {readout}
        </span>
      </div>

      <div
        className={`group flex cursor-pointer touch-none items-center select-none ${
          dense ? "h-6" : "mt-1 h-8"
        }`}
        style={{ paddingInline: THUMB / 2 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() =>
          defaultValue !== undefined && onChange(defaultValue)
        }
      >
        <div ref={track} className="relative h-1.5 w-full rounded-full bg-pill">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${ratio * 100}%` }}
          />

          {notch !== null && (
            <span
              aria-hidden="true"
              className="absolute top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/25"
              style={{ left: `${notch * 100}%` }}
            />
          )}

          <div
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-valuetext={readout}
            onKeyDown={onKeyDown}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 outline-none"
            style={{ left: `${ratio * 100}%`, width: THUMB, height: THUMB }}
          >
            {/* Halo, seen on hover, focus and while held. */}
            <span
              aria-hidden="true"
              className={`absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/10 transition-transform duration-200 ease-out group-hover:scale-100 group-has-[:focus-visible]:scale-100 ${
                dragging ? "scale-100" : "scale-0"
              }`}
            />
            <span
              aria-hidden="true"
              className={`absolute inset-0 rounded-full bg-primary shadow-[0_1px_5px_rgba(0,0,0,0.35)] ring-[3px] ring-card transition-transform duration-150 ease-out ${
                dragging ? "scale-110" : "scale-100"
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type RangeSliderProps = NumberAffixes & {
  label: string;
  /** The low end and the high end. */
  value: [number, number];
  min: number;
  max: number;
  step?: number;
  /** The closest the two ends may come. */
  gap?: number;
  /** Tighter rows, for small floating panels. */
  dense?: boolean;
  /** Writes each end in the readout, by name from server pages or as a function. */
  format?: NumberFormat;
  onChange: (value: [number, number]) => void;
};

/**
 * Two thumbs on one track, for a span like a price range. A press moves the
 * closer thumb, and the two never cross.
 */
export function RangeSlider({
  label,
  value,
  min,
  max,
  step = 1,
  gap = 0,
  dense = false,
  format: formatAs = String,
  prefix,
  suffix,
  onChange,
}: RangeSliderProps) {
  const format = (value: number) => formatNumber(value, formatAs, { prefix, suffix });
  const track = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<0 | 1 | null>(null);
  const [low, high] = value;
  const decimals = (String(step).split(".")[1] ?? "").length;

  const snap = (next: number) =>
    Number(
      (
        Math.round((Math.min(max, Math.max(min, next)) - min) / step) * step +
        min
      ).toFixed(decimals + 1),
    );

  const move = (thumb: 0 | 1, next: number) => {
    const snapped = snap(next);
    if (thumb === 0) onChange([Math.min(snapped, high - gap), high]);
    else onChange([low, Math.max(snapped, low + gap)]);
  };

  const at = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return null;
    return min + ((clientX - rect.left) / rect.width) * (max - min);
  };

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const next = at(event.clientX);
    if (next === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    // The closer thumb answers. When they sit together, the side decides.
    const thumb: 0 | 1 =
      Math.abs(next - low) < Math.abs(next - high) ||
      (low === high && next < low)
        ? 0
        : 1;
    setHeld(thumb);
    move(thumb, next);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (held === null) return;
    const next = at(event.clientX);
    if (next !== null) move(held, next);
  }

  function onKeyDown(thumb: 0 | 1, event: KeyboardEvent<HTMLDivElement>) {
    const now = value[thumb];
    const big = step * 10;
    const moves: Record<string, number> = {
      ArrowRight: now + step,
      ArrowUp: now + step,
      ArrowLeft: now - step,
      ArrowDown: now - step,
      PageUp: now + big,
      PageDown: now - big,
      Home: min,
      End: max,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    move(thumb, moves[event.key]);
  }

  const ratio = (number: number) => (number - min) / (max - min);

  return (
    <div>
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{label}</span>
        <span
          className={`text-[12px] tabular-nums transition-colors ${
            held !== null ? "text-foreground" : ""
          }`}
        >
          {format(low)} to {format(high)}
        </span>
      </div>

      <div
        className={`group flex cursor-pointer touch-none items-center select-none ${
          dense ? "h-6" : "mt-1 h-8"
        }`}
        style={{ paddingInline: THUMB / 2 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setHeld(null)}
        onPointerCancel={() => setHeld(null)}
      >
        <div ref={track} className="relative h-1.5 w-full rounded-full bg-pill">
          <div
            className="absolute inset-y-0 rounded-full bg-primary"
            style={{
              left: `${ratio(low) * 100}%`,
              width: `${(ratio(high) - ratio(low)) * 100}%`,
            }}
          />

          {([0, 1] as const).map((thumb) => (
            <div
              key={thumb}
              role="slider"
              tabIndex={0}
              aria-label={`${label}, ${thumb === 0 ? "from" : "to"}`}
              aria-valuemin={thumb === 0 ? min : low + gap}
              aria-valuemax={thumb === 0 ? high - gap : max}
              aria-valuenow={value[thumb]}
              aria-valuetext={format(value[thumb])}
              onKeyDown={(event) => onKeyDown(thumb, event)}
              className="group/thumb absolute top-1/2 -translate-x-1/2 -translate-y-1/2 outline-none"
              style={{
                left: `${ratio(value[thumb]) * 100}%`,
                width: THUMB,
                height: THUMB,
                // The low thumb comes up when both sit at the top.
                zIndex: held === thumb || (thumb === 0 && low === max) ? 2 : 1,
              }}
            >
              <span
                aria-hidden="true"
                className={`absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/10 transition-transform duration-200 ease-out group-focus-visible/thumb:scale-100 ${
                  held === thumb ? "scale-100" : "scale-0"
                }`}
              />
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-full bg-primary shadow-[0_1px_5px_rgba(0,0,0,0.35)] ring-[3px] ring-card transition-transform duration-150 ease-out ${
                  held === thumb ? "scale-110" : "scale-100"
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
