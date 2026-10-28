"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons";
import { IconButton } from "./button";
import { Checkbox } from "./checkbox";
import { cx, EASE } from "./cx";
import { SearchField } from "./field";
import { Icon } from "./icon";
import { Select } from "./select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

export type DataTableColumn<Row> = {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** The value to sort on. The column can be sorted when it has one. */
  sortValue?: (row: Row) => string | number;
  align?: "left" | "right";
  /** Leaves the column out on phones. */
  hideOnMobile?: boolean;
  className?: string;
};

type Sort = { id: string; direction: "ascending" | "descending" } | null;

const compare = (a: string | number, b: string | number) =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true });

/**
 * A table that does the work. Search the rows, sort by a column, select
 * rows to act on them and page through the rest. Give it rows and columns,
 * it keeps everything else.
 */
export function DataTable<Row>({
  rows,
  columns,
  rowId,
  label,
  searchText,
  searchPlaceholder = "Search",
  selectable = false,
  selected: held,
  onSelectedChange,
  pageSizes = [10, 20, 50],
  defaultPageSize,
  actions,
  empty,
  className,
}: {
  rows: Row[];
  columns: DataTableColumn<Row>[];
  /** A stable key for each row. */
  rowId: (row: Row) => string;
  /** What the table holds, for screen readers. */
  label: string;
  /** The words a row is found by. Shows the search field when given. */
  searchText?: (row: Row) => string;
  searchPlaceholder?: string;
  /** A box at the start of each row, and one in the header for all. */
  selectable?: boolean;
  /** The selected row keys, when you hold them yourself. */
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  pageSizes?: number[];
  defaultPageSize?: number;
  /** Buttons beside the search, like New invoice. */
  actions?: ReactNode;
  /** What to show when there are no rows to show. */
  empty?: ReactNode;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(defaultPageSize ?? pageSizes[0] ?? 10);
  const [own, setOwn] = useState<string[]>([]);
  const ticked = held ?? own;
  const select = (ids: string[]) => {
    setOwn(ids);
    onSelectedChange?.(ids);
  };

  const needle = query.trim().toLowerCase();
  const found =
    searchText && needle
      ? rows.filter((row) => searchText(row).toLowerCase().includes(needle))
      : rows;
  const sortValue = sort
    ? columns.find((column) => column.id === sort.id)?.sortValue
    : undefined;
  const sorted =
    sort && sortValue
      ? [...found].sort((a, b) => {
          const order = compare(sortValue(a), sortValue(b));
          return sort.direction === "ascending" ? order : -order;
        })
      : found;

  const pages = Math.max(1, Math.ceil(sorted.length / size));
  // A page past the end, after a search or a delete, shows the last one.
  const current = Math.min(page, pages - 1);
  const shown = sorted.slice(current * size, current * size + size);
  const first = sorted.length ? current * size + 1 : 0;
  const last = current * size + shown.length;

  const foundIds = found.map(rowId);
  const tickedFound = foundIds.filter((id) => ticked.includes(id));
  const all: boolean | "indeterminate" =
    tickedFound.length === 0
      ? false
      : tickedFound.length === foundIds.length
        ? true
        : "indeterminate";

  const toggleAll = () =>
    select(
      all === true
        ? ticked.filter((id) => !foundIds.includes(id))
        : [...new Set([...ticked, ...foundIds])],
    );
  const toggle = (id: string) =>
    select(
      ticked.includes(id)
        ? ticked.filter((value) => value !== id)
        : [...ticked, id],
    );

  // Ascending, then descending, then back to how the rows came.
  const sortBy = (id: string) =>
    setSort((now) =>
      now?.id !== id
        ? { id, direction: "ascending" }
        : now.direction === "ascending"
          ? { id, direction: "descending" }
          : null,
    );

  const span = columns.length + (selectable ? 1 : 0);
  const mobile = (column: DataTableColumn<Row>) =>
    column.hideOnMobile && "hidden sm:table-cell";

  return (
    <div
      className={cx(
        "w-full overflow-hidden rounded-panel border border-border bg-card shadow-card",
        className,
      )}
    >
      {(searchText || actions) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          {searchText && (
            <SearchField
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-w-0 flex-1 sm:max-w-xs"
            />
          )}
          {actions && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      <Table bare aria-label={label}>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-0 pr-0">
                <Checkbox
                  checked={all}
                  onChange={toggleAll}
                  aria-label="Select all rows"
                  className="align-middle"
                />
              </TableHead>
            )}
            {columns.map((column) => {
              const on = sort?.id === column.id ? sort.direction : null;
              return (
                <TableHead
                  key={column.id}
                  align={column.align}
                  aria-sort={column.sortValue ? (on ?? "none") : undefined}
                  className={cx(mobile(column), column.className)}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => sortBy(column.id)}
                      className={cx(
                        "group/sort inline-flex cursor-pointer items-center gap-1 transition-colors duration-150 hover:text-foreground",
                        on && "text-foreground",
                        column.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {column.header}
                      <motion.span
                        aria-hidden="true"
                        className={cx(
                          "flex transition-opacity duration-150",
                          on
                            ? "opacity-100"
                            : "opacity-0 group-hover/sort:opacity-40 group-focus-visible/sort:opacity-40",
                        )}
                        initial={false}
                        animate={{ rotate: on === "descending" ? 180 : 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                      >
                        <Icon icon={ArrowUp01Icon} size={12} strokeWidth={2.2} />
                      </motion.span>
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => {
            const id = rowId(row);
            const on = ticked.includes(id);
            return (
              <TableRow key={id} selected={on}>
                {selectable && (
                  <TableCell className="w-0 pr-0">
                    <Checkbox
                      checked={on}
                      onChange={() => toggle(id)}
                      aria-label={`Select ${id}`}
                      className="align-middle"
                    />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    align={column.align}
                    className={cx(mobile(column), column.className)}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {shown.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={span}
                className="h-40 text-center text-label text-muted"
              >
                {empty ??
                  (needle ? `Nothing matches ${query.trim()}` : "Nothing here yet")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border py-2.5 pr-3 pl-5 text-caption text-muted">
        <p className="tabular-nums">
          {selectable && tickedFound.length > 0
            ? `${tickedFound.length} of ${found.length} selected`
            : `${first} to ${last} of ${sorted.length}`}
        </p>
        <div className="flex items-center gap-3">
          {pageSizes.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">Rows</span>
              <div className="w-[72px]">
                <Select
                  size="sm"
                  label="Rows per page"
                  value={String(size)}
                  onChange={(value) => {
                    setSize(Number(value));
                    setPage(0);
                  }}
                  options={pageSizes.map((value) => ({
                    id: String(value),
                    label: String(value),
                  }))}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-0.5">
            <IconButton
              label="Previous page"
              icon={ArrowLeft01Icon}
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            />
            <span className="min-w-12 text-center tabular-nums">
              {current + 1} of {pages}
            </span>
            <IconButton
              label="Next page"
              icon={ArrowRight01Icon}
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
