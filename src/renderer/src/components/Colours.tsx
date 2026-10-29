import { useRef, type CSSProperties, type ReactNode } from "react";
import { cx, Tooltip } from "@/components/ui";
import { t } from "../../../shared/i18n";

// Bookbinder's cloth: deep, quiet colours that sit well side by side.
export const CLOTH = ["#2c3e50", "#7a2e2e", "#2f5d50", "#3b3561", "#8a5a2b", "#1f4e79", "#4a4a4a", "#6d3b5c", "#2d6a6a", "#9c4221"];

/** Spines to pick by hand: the cloth, with paper and black. Names stay English here and are translated where they're shown. */
export const SPINES: Array<[string, string]> = [
  ["#e9e2d0", "Paper"],
  ["#1d1b18", "Black"],
  ["#2c3e50", "Slate blue"],
  ["#1f4e79", "Navy"],
  ["#2d6a6a", "Teal"],
  ["#2f5d50", "Green"],
  ["#8a5a2b", "Tan"],
  ["#9c4221", "Rust"],
  ["#7a2e2e", "Oxblood"],
  ["#6d3b5c", "Plum"],
  ["#3b3561", "Indigo"],
  ["#4a4a4a", "Grey"],
];

/** Ribbons: silk colours that show against any spine. */
export const RIBBONS: Array<[string, string]> = [
  ["accent", "Accent"],
  ["#b3261e", "Crimson"],
  ["#d4a23a", "Gold"],
  ["#2f7a52", "Green"],
  ["#2b55a3", "Blue"],
  ["#7d3c98", "Violet"],
  ["#e58fb0", "Pink"],
  ["#1d1b18", "Black"],
  ["#f3ecdc", "Ivory"],
];

export const ribbonColour = (value?: string) => (!value || value === "accent" ? "var(--accent)" : value);

const ring = "shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--foreground)]";

function Dot({ label, on, onClick, style, className, children }: {
  label: string;
  on: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}) {
  // Colour names are kept in English in the lists above, so they're translated here, when shown.
  const name = t(label);
  return (
    <Tooltip content={name}>
      <button
        type="button"
        aria-label={name}
        aria-pressed={on}
        onClick={onClick}
        className={cx(
          "relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full transition-transform duration-150 outline-none hover:scale-110 focus-visible:scale-110",
          on ? ring : "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]",
          className,
        )}
        style={style}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * A row of colours to pick from, with an optional first choice that hands the
 * colour back to the bookcase, an optional "none", and any colour at all.
 */
export function ColourPicker({
  value, options, onChange, auto, none, any = true,
}: {
  /** The picked colour, or undefined for the automatic one. */
  value?: string;
  options: Array<[string, string]>;
  onChange: (value: string | undefined) => void;
  /** Label for the automatic choice, when there is one. */
  auto?: string;
  /** Label for no colour at all, when there is one. */
  none?: string;
  /** Offers any colour at all, besides the ones listed. */
  any?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const custom = value && value !== "none" && !options.some(([c]) => c === value) ? value : undefined;
  return (
    <div className="flex flex-wrap gap-2 p-0.5">
      {auto && (
        <Dot label={auto} on={value === undefined} onClick={() => onChange(undefined)} className="bg-control text-[10px] font-medium text-muted">
          A
        </Dot>
      )}
      {none && (
        <Dot label={none} on={value === "none"} onClick={() => onChange("none")} className="bg-well">
          <span className="absolute h-px w-[140%] rotate-45 bg-line-strong" />
        </Dot>
      )}
      {options.map(([colour, label]) => (
        <Dot key={colour} label={label} on={value === colour} onClick={() => onChange(colour)} style={{ background: ribbonColour(colour) }} />
      ))}
      {any && (
      <Dot
        label="Any colour"
        on={!!custom}
        onClick={() => input.current?.click()}
        style={{ background: custom ?? "conic-gradient(from 90deg, #e5484d, #f5a524, #f5d90a, #46a758, #3e9bd8, #6e56cf, #d6409f, #e5484d)" }}
      >
        <input
          ref={input}
          type="color"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0"
          value={custom ?? "#7a2e2e"}
          onChange={(e) => onChange(e.target.value)}
        />
      </Dot>
      )}
    </div>
  );
}
