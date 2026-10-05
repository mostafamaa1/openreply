"use client";

/**
 * Data Table
 *
 * Sortable, searchable, paginated, with a column picker and CSV export. On a
 * phone each row becomes a compact card (primary cell plus a few figures), so
 * nothing needs sideways scrolling.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Download,
  Search,
  SearchX,
} from "lucide-react";
import { EmptyState } from "@/components/broadcast/primitives";

export interface Column<Row> {
  key: string;
  header: string;
  /** Value used for sorting and CSV. */
  value: (row: Row) => string | number | null;
  render?: (row: Row) => React.ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  /** Hidden until switched on in the column picker. */
  defaultHidden?: boolean;
  /** Always shown; cannot be hidden. */
  pinned?: boolean;
  /** Shown as a figure on the phone card. */
  mobile?: boolean;
  className?: string;
}

type Sort = { key: string; dir: "asc" | "desc" } | null;

function toCsv<Row>(rows: Row[], columns: Array<Column<Row>>): string {
  const escape = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    columns.map((c) => escape(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => escape(c.value(r))).join(",")),
  ].join("\n");
}

export default function DataTable<Row>({
  rows,
  columns,
  rowKey,
  searchText,
  searchPlaceholder = "Search",
  initialSort = null,
  pageSize = 25,
  filters,
  exportName,
  emptyTitle = "Nothing matches",
  emptyHint = "Try a different search or filter.",
}: {
  rows: Row[];
  columns: Array<Column<Row>>;
  rowKey: (row: Row) => string;
  /** Text a row is searched by; omit to hide the search box. */
  searchText?: (row: Row) => string;
  searchPlaceholder?: string;
  initialSort?: Sort;
  pageSize?: number;
  /** Extra filter controls rendered beside the search box. */
  filters?: React.ReactNode;
  /** File name for CSV export; omit to hide the button. */
  exportName?: string;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(initialSort);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key))
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pickerOpen]);

  const visible = columns.filter((c) => c.pinned || !hidden.has(c.key));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : rows;
    if (!sort) return matched;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return matched;
    return [...matched].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      // Missing values sink to the bottom whichever way the sort runs.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, sort, columns, searchText]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = filtered.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(key: string) {
    setPage(0);
    setSort((s) =>
      s?.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null
    );
  }

  function exportCsv() {
    const blob = new Blob([toCsv(filtered, visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const primary = visible[0];
  const figures = visible.filter((c) => c.mobile && c !== primary).slice(0, 4);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {searchText && (
            <label className="relative block w-full sm:max-w-xs">
              <span className="sr-only">{searchPlaceholder}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-border-hover"
              />
            </label>
          )}
          {filters}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">
            {filtered.length.toLocaleString()} {filtered.length === 1 ? "row" : "rows"}
          </span>
          <div ref={pickerRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              aria-expanded={pickerOpen}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted hover:border-border-hover hover:text-foreground"
            >
              <Columns3 className="h-4 w-4" />
              Columns
            </button>
            {pickerOpen && (
              <div className="panel absolute right-0 z-40 mt-2 w-52 p-2">
                {columns
                  .filter((c) => !c.pinned)
                  .map((c) => (
                    <label
                      key={c.key}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-surface-hover"
                    >
                      <input
                        type="checkbox"
                        checked={!hidden.has(c.key)}
                        onChange={() =>
                          setHidden((h) => {
                            const next = new Set(h);
                            if (next.has(c.key)) next.delete(c.key);
                            else next.add(c.key);
                            return next;
                          })
                        }
                        className="accent-[var(--accent)]"
                      />
                      {c.header}
                    </label>
                  ))}
              </div>
            )}
          </div>
          {exportName && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted hover:border-border-hover hover:text-foreground disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={SearchX} title={emptyTitle}>
          {emptyHint}
        </EmptyState>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="space-y-2 sm:hidden">
            {pageRows.map((row) => (
              <li
                key={rowKey(row)}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="text-sm">{primary.render ? primary.render(row) : primary.value(row)}</div>
                {figures.length > 0 && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                    {figures.map((c) => (
                      <div key={c.key} className="flex justify-between gap-2 text-xs">
                        <dt className="text-muted">{c.header}</dt>
                        <dd className="font-semibold text-foreground">
                          {c.render ? c.render(row) : c.value(row) ?? "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>

          {/* Tablet and up: table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {visible.map((c) => {
                    const active = sort?.key === c.key;
                    const Icon = !active ? ChevronsUpDown : sort.dir === "desc" ? ArrowDown : ArrowUp;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : undefined}
                        className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted first:pl-0 ${
                          c.align === "right" ? "text-right" : "text-left"
                        }`}
                      >
                        {c.sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={`inline-flex items-center gap-1 uppercase hover:text-foreground ${active ? "text-foreground" : ""}`}
                          >
                            {c.header}
                            <Icon className={`h-3 w-3 ${active ? "" : "opacity-50"}`} />
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className="border-b border-border transition-colors last:border-0 hover:bg-surface-hover"
                  >
                    {visible.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-3 first:pl-0 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}
                      >
                        {c.render ? c.render(row) : c.value(row) ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-muted">
              <span>
                Page {current + 1} of {pages}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, current - 1))}
                  disabled={current === 0}
                  aria-label="Previous page"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:border-border-hover disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pages - 1, current + 1))}
                  disabled={current >= pages - 1}
                  aria-label="Next page"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:border-border-hover disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
