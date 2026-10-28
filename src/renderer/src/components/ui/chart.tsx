"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx, EASE } from "./cx";
import { formatNumber, type NumberAffixes, type NumberFormat } from "./numbers";

export type ChartPoint = { label: string; value: number };
export type ChartSeries = { name: string; data: ChartPoint[] };

type Data =
  | {
      /** One series, as a label and a value per point. */
      data: ChartPoint[];
      series?: never;
    }
  | {
      /** Several series over the same labels, each in a lighter shade. */
      series: ChartSeries[];
      data?: never;
    };

type Shared = Data & NumberAffixes & {
  /** What it shows, read out by screen readers. */
  label: string;
  /** Height in pixels. The width follows the parent. */
  height?: number;
  /**
   * Writes values in the tooltip. A name works from server pages, a function
   * only from client code. Short numbers like 18K by default.
   */
  format?: NumberFormat;
  /** Writes values on the axis, where room is short. Falls back to format. */
  axisFormat?: NumberFormat;
  /** Names the series over the chart. On when there is more than one. */
  legend?: boolean;
  className?: string;
};

export type BarChartProps = Shared;
export type LineChartProps = Shared & {
  /** Fills the space under each line. */
  area?: boolean;
  /** A smooth line that never overshoots a point, or straight segments. */
  curve?: "smooth" | "straight";
};

// Shades of the main colour, strongest first. That is the ink unless a theme says otherwise.
const SHADES: Record<number, number[]> = {
  1: [100],
  2: [100, 40],
  3: [100, 55, 28],
  4: [100, 66, 42, 22],
};
const shade = (i: number, count: number) => {
  const list = SHADES[Math.min(count, 4)] ?? SHADES[4];
  return list[Math.min(i, list.length - 1)];
};
const ink = (percent: number) =>
  `color-mix(in oklab, var(--primary) ${percent}%, transparent)`;

// Round steps, so the axis reads 0, 5k, 10k and not 0, 4.3k, 8.6k.
function ticks(low: number, high: number) {
  if (low === high) high = low + 1;
  const raw = (high - low) / 4;
  const size = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * size).find((s) => s >= raw) ?? raw;
  const from = Math.floor(low / step) * step;
  const to = Math.ceil(high / step) * step;
  const list: number[] = [];
  for (let at = from; at <= to + step / 2; at += step)
    list.push(Number(at.toFixed(10)));
  return list;
}

type Spot = [number, number];

function straight(spots: Spot[]) {
  return spots.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
}

// A monotone curve, which bends through each point without overshooting it.
function smooth(spots: Spot[]) {
  const n = spots.length;
  if (n < 3) return straight(spots);
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++)
    slopes.push((spots[i + 1][1] - spots[i][1]) / (spots[i + 1][0] - spots[i][0]));
  const tangents = spots.map((_, i) =>
    i === 0
      ? slopes[0]
      : i === n - 1
        ? slopes[n - 2]
        : slopes[i - 1] * slopes[i] <= 0
          ? 0
          : (slopes[i - 1] + slopes[i]) / 2,
  );
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangents[i] = t * a * slopes[i];
      tangents[i + 1] = t * b * slopes[i];
    }
  }
  let path = `M${spots[0][0]},${spots[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = spots[i];
    const [x1, y1] = spots[i + 1];
    const third = (x1 - x0) / 3;
    path += ` C${x0 + third},${y0 + tangents[i] * third} ${x1 - third},${y1 - tangents[i + 1] * third} ${x1},${y1}`;
  }
  return path;
}

// A bar from the baseline to its end, rounded only at the end.
function bar(x: number, width: number, base: number, end: number) {
  const up = base >= end ? 1 : -1;
  const r = Math.min(5, width / 2, Math.abs(base - end));
  return [
    `M${x},${base}`,
    `L${x},${end + up * r}`,
    `Q${x},${end} ${x + r},${end}`,
    `L${x + width - r},${end}`,
    `Q${x + width},${end} ${x + width},${end + up * r}`,
    `L${x + width},${base}`,
    "Z",
  ].join(" ");
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function Chart({
  kind,
  label,
  height = 240,
  format = "compact",
  axisFormat,
  prefix,
  suffix,
  legend,
  area = false,
  curve = "smooth",
  className,
  ...props
}: Shared & {
  kind: "bar" | "line";
  area?: boolean;
  curve?: "smooth" | "straight";
}) {
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const all: ChartSeries[] = props.series ?? [{ name: label, data: props.data ?? [] }];
  const labels = all[0]?.data.map((point) => point.label) ?? [];
  const count = labels.length;
  const write = (value: number) => formatNumber(value, format, { prefix, suffix });
  const writeAxis = (value: number) => formatNumber(value, axisFormat ?? format, { prefix, suffix });
  const values = all.flatMap((series) => series.data.map((point) => point.value));
  const marks = ticks(Math.min(0, ...values), Math.max(0, ...values));
  const low = marks[0];
  const high = marks[marks.length - 1];
  const showLegend = legend ?? all.length > 1;

  // Room for the longest number on the left and the labels underneath.
  const left = Math.max(...marks.map((mark) => writeAxis(mark).length)) * 6.8 + 14;
  const right = 8;
  const top = 10;
  const bottom = 28;
  const plotWidth = Math.max(0, width - left - right);
  const plotHeight = height - top - bottom;
  const band = count ? plotWidth / count : 0;
  const y = (value: number) => top + plotHeight * (1 - (value - low) / (high - low));
  const center = (i: number) => left + band * (i + 0.5);
  const base = y(Math.max(low, Math.min(0, high)));
  const longest = Math.max(1, ...labels.map((text) => text.length));
  const every = Math.max(1, Math.ceil((count * (longest * 6.5 + 12)) / Math.max(1, plotWidth)));

  // Bars sit side by side in the middle of their band.
  const group = Math.min(band * (all.length > 1 ? 0.72 : 0.56), all.length * 44);
  const gap = all.length > 1 ? 3 : 0;
  const barWidth = Math.max(1, (group - gap * (all.length - 1)) / all.length);

  const point = (event: { clientX: number; currentTarget: Element }) => {
    const box = event.currentTarget.getBoundingClientRect();
    const i = Math.floor((event.clientX - box.left - left) / band);
    setActive(i >= 0 && i < count ? i : null);
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = active ?? -1;
    const moves: Record<string, number> = {
      ArrowRight: Math.min(count - 1, at + 1),
      ArrowLeft: Math.max(0, at < 0 ? count - 1 : at - 1),
      Home: 0,
      End: count - 1,
    };
    if (event.key === "Escape") setActive(null);
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive(moves[event.key]);
  };

  const tipSide = active !== null && center(active) > width / 2 ? "left" : "right";
  const reach = kind === "bar" ? group / 2 + 10 : 14;

  return (
    <div className={cx("w-full", className)}>
      {showLegend && (
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-muted">
          {all.map((series, s) => (
            <span key={series.name} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: ink(shade(s, all.length)) }}
              />
              {series.name}
            </span>
          ))}
        </div>
      )}

      <div
        ref={ref}
        role="group"
        aria-label={label}
        tabIndex={0}
        onKeyDown={keys}
        onBlur={() => setActive(null)}
        className="relative rounded-item outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-line-strong"
        style={{ height }}
      >
        {width > 0 && count > 0 && (
          <svg
            width={width}
            height={height}
            aria-hidden="true"
            className="block overflow-visible"
            onPointerMove={point}
            onPointerLeave={() => setActive(null)}
          >
            {marks.map((mark) => (
              <g key={mark}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(mark)}
                  y2={y(mark)}
                  className={mark === 0 ? "stroke-line-strong" : "stroke-border"}
                />
                <text
                  x={left - 10}
                  y={y(mark)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted text-caption tabular-nums"
                >
                  {writeAxis(mark)}
                </text>
              </g>
            ))}

            {labels.map((text, i) =>
              i % every === 0 ? (
                <text
                  key={`${text}-${i}`}
                  x={center(i)}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-muted text-caption"
                >
                  {text}
                </text>
              ) : null,
            )}

            {kind === "bar" && (
              <>
                <AnimatePresence>
                  {active !== null && (
                    <motion.rect
                      initial={{ opacity: 0, x: center(active) - group / 2 - 6 }}
                      animate={{
                        opacity: 1,
                        x: center(active) - group / 2 - 6,
                        transition: { duration: 0.15, ease: EASE },
                      }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      y={top}
                      width={group + 12}
                      height={plotHeight}
                      rx={10}
                      className="fill-control"
                    />
                  )}
                </AnimatePresence>
                {all.map((series, s) =>
                  series.data.map((item, i) => {
                    const x = center(i) - group / 2 + s * (barWidth + gap);
                    return (
                      <motion.path
                        key={`${s}-${i}-${count}`}
                        initial={{ d: bar(x, barWidth, base, base) }}
                        animate={{ d: bar(x, barWidth, base, y(item.value)) }}
                        transition={{ duration: 0.45, ease: EASE, delay: i * 0.025 }}
                        style={{ fill: ink(shade(s, all.length)) }}
                      />
                    );
                  }),
                )}
              </>
            )}

            {kind === "line" && (
              <>
                {active !== null && (
                  <line
                    x1={center(active)}
                    x2={center(active)}
                    y1={top}
                    y2={top + plotHeight}
                    className="stroke-line-strong"
                  />
                )}
                {all.map((series, s) => {
                  const draw = curve === "smooth" ? smooth : straight;
                  const spots = series.data.map((item, i): Spot => [center(i), y(item.value)]);
                  const flat = spots.map(([x]): Spot => [x, base]);
                  const close = (path: string) =>
                    `${path} L${spots[spots.length - 1][0]},${base} L${spots[0][0]},${base} Z`;
                  const tint = shade(s, all.length);
                  return (
                    <g key={`${series.name}-${count}`}>
                      {area && (
                        <motion.path
                          initial={{ d: close(draw(flat)) }}
                          animate={{ d: close(draw(spots)) }}
                          transition={{ duration: 0.6, ease: EASE }}
                          style={{ fill: ink(Math.round(tint * 0.08)) }}
                        />
                      )}
                      <motion.path
                        initial={{ d: draw(flat) }}
                        animate={{ d: draw(spots) }}
                        transition={{ duration: 0.6, ease: EASE }}
                        fill="none"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ stroke: ink(tint) }}
                      />
                    </g>
                  );
                })}
                {active !== null &&
                  all.map((series, s) =>
                    series.data[active] ? (
                      <circle
                        key={series.name}
                        cx={center(active)}
                        cy={y(series.data[active].value)}
                        r={4}
                        strokeWidth={2}
                        className="fill-card"
                        style={{ stroke: ink(shade(s, all.length)) }}
                      />
                    ) : null,
                  )}
              </>
            )}
          </svg>
        )}

        <AnimatePresence>
          {active !== null && width > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.15, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              style={{
                top,
                left: tipSide === "right" ? center(active) + reach : undefined,
                right: tipSide === "left" ? width - center(active) + reach : undefined,
                transformOrigin: tipSide === "right" ? "top left" : "top right",
              }}
              className="pointer-events-none absolute z-10 min-w-28 rounded-item border border-border bg-card px-3 py-2 shadow-float"
            >
              <p className="text-caption whitespace-nowrap text-muted">{labels[active]}</p>
              {all.length === 1 ? (
                <p className="mt-0.5 text-label font-medium whitespace-nowrap tabular-nums">
                  {write(all[0].data[active]?.value ?? 0)}
                </p>
              ) : (
                <div className="mt-1 flex flex-col gap-1">
                  {all.map((series, s) => (
                    <p key={series.name} className="flex items-center gap-2 text-label whitespace-nowrap">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: ink(shade(s, all.length)) }}
                      />
                      <span className="flex-1 text-muted">{series.name}</span>
                      <span className="pl-3 font-medium tabular-nums">
                        {write(series.data[active]?.value ?? 0)}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <table className="sr-only">
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Label</th>
              {all.map((series) => (
                <th key={series.name} scope="col">
                  {series.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((text, i) => (
              <tr key={`${text}-${i}`}>
                <th scope="row">{text}</th>
                {all.map((series) => (
                  <td key={series.name}>{write(series.data[i]?.value ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Bars from zero, one per label, or a few side by side for several series.
 * It fills the width it is given, grows in on first show, and names the
 * value under the pointer or the arrow keys.
 */
export function BarChart(props: BarChartProps) {
  return <Chart kind="bar" {...props} />;
}

/**
 * A line through each value, with the space under it filled when asked.
 * It fills the width it is given, rises in on first show, and names the
 * values under the pointer or the arrow keys.
 */
export function LineChart(props: LineChartProps) {
  return <Chart kind="line" {...props} />;
}
