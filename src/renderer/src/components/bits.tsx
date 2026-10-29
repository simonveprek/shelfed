// Fragms Personal kit, (c) 2026 Šimon Vepřek. Not MIT: only for use as part of Shelfed. See LICENSE-FRAGMS-PERSONAL.md.
import type { ReactNode } from "react";
import { CharacterPoint, type Character } from "@/components/character";
import { cx, Icon, Panel, SectionHeader, type IconLike } from "@/components/ui";

/*
 * Page pieces built from Fragms UI. Surfaces go panel, well, control.
 */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return <SectionHeader as="h1" title={title} description={description} action={action} className="mb-10" />;
}

/** A titled panel. Settings pages are a stack of these. */
export function Section({
  title,
  description,
  action,
  icon,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** A small icon on a tile before the title. */
  icon?: IconLike;
  children: ReactNode;
}) {
  return (
    <Panel padded={false} className="mb-4">
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon != null && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-control text-muted">
              <Icon icon={icon} size={16} strokeWidth={1.8} />
            </span>
          )}
          <div className={cx("min-w-0", icon != null && "pt-1")}>
            <h2 className="text-[15px] leading-snug font-medium">{title}</h2>
            {description && <p className="mt-1 text-label text-muted">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </Panel>
  );
}

/** Rows on a panel of their own, or in a well when inside one. */
export function List({
  inset = false,
  className,
  children,
}: {
  inset?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ul
      className={cx(
        "divide-y divide-border overflow-hidden border border-border",
        inset ? "rounded-field bg-well" : "rounded-panel bg-card shadow-card",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function Row({ className, children }: { className?: string; children: ReactNode }) {
  return <li className={cx("flex flex-wrap items-center gap-3 px-5 py-3.5", className)}>{children}</li>;
}

/** A label over a control. The Fragms Field, as a real label. */
export function FormField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-2.5", className)}>
      <span className="text-label">{label}</span>
      {children}
      {hint && <span className="-mt-1 text-caption text-muted">{hint}</span>}
    </label>
  );
}

/** What a list shows before it has anything. Give it a Point to make it feel less empty. */
export function Empty({ point, children }: { point?: Character; children: ReactNode }) {
  return (
    <div
      className={cx(
        "flex flex-col items-center rounded-panel border border-dashed border-line-strong px-6 text-center text-label text-muted",
        point ? "pt-10 pb-12" : "py-14",
      )}
    >
      {point && <CharacterPoint {...point} energy={0.8} size={52} className="mb-4" />}
      <div className="max-w-[44ch]">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-1">
      <p className="text-label text-muted">{label}</p>
      <p className="text-[28px] leading-tight font-medium tracking-[-0.03em] tabular-nums">{value}</p>
      {hint && <p className="text-caption text-muted">{hint}</p>}
      {children && <div className="mt-3">{children}</div>}
    </Panel>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-control">
      <div
        className={cx("h-full rounded-full transition-[width] duration-500 ease-smooth", ratio > 0.9 ? "bg-danger" : "bg-foreground")}
        style={{ width: `${ratio > 0 ? Math.max(ratio * 100, 2) : 0}%` }}
      />
    </div>
  );
}

/**
 * A small word on a pill with a tone, for statuses. A plain string gets a
 * capital first letter and nothing more, so "owner" reads Owner and
 * "5 days" stays 5 days. Anything else shows as given.
 */
export function Status({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "strong" | "good" | "bad";
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-px text-[11px] leading-[1.45] font-semibold",
        tone === "strong" && "bg-foreground text-background",
        tone === "neutral" && "bg-control text-muted",
        tone === "good" && "bg-success/12 text-success",
        tone === "bad" && "bg-danger/12 text-danger",
      )}
    >
      {typeof children === "string" ? children.charAt(0).toUpperCase() + children.slice(1) : children}
    </span>
  );
}

/** Small heading over a block that is not in a panel. */
export function Subhead({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-10 mb-3 flex items-center justify-between gap-4 px-1">
      <h2 className="text-label font-medium text-muted">{children}</h2>
      {action}
    </div>
  );
}

export const when = (date: Date | string | null | undefined) =>
  date
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date))
    : "";

export const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

export const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n);
