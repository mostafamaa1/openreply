"use client";

/**
 * DM Logs
 *
 * Every comment or DM that matched a campaign, and what happened to it.
 * Filtered by the global date range, a status and a search across commenter,
 * text, keyword and campaign; paginated on the server.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ScrollText, Search } from "lucide-react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import StatusBadge from "@/components/status-badge";
import { EmptyState, Segmented, Skeleton } from "@/components/broadcast/primitives";
import { useRange } from "@/components/range-context";
import { useApi } from "@/lib/use-api";

interface DmLog {
  id: string;
  commenterId: string;
  commenterName: string | null;
  commentText: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  automation: { name: string; keywords: string[] };
  instagramAccount: { username: string };
}

interface LogsResponse {
  logs: DmLog[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
  { value: "PENDING", label: "Pending" },
  { value: "SKIPPED_DEDUP", label: "Already DMed" },
  { value: "SKIPPED_RATE_LIMIT", label: "Rate limited" },
  { value: "SKIPPED_PLAN_LIMIT", label: "Plan limit" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LogsPage() {
  const searchParams = useSearchParams();
  const { query: rangeQuery, label } = useRange();
  const initialStatus = searchParams.get("status");
  const [status, setStatus] = useState<StatusFilter>(
    STATUS_FILTERS.some((s) => s.value === initialStatus) ? (initialStatus as StatusFilter) : "ALL"
  );
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState(searchParams.get("instagramAccountId") ?? "all");

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (!payload.success) return;
        const list: AccountOption[] = payload.data.instagramAccounts ?? [];
        setAccounts(list);
        // A link to a disconnected account would otherwise filter to nothing,
        // with the filter hidden when one account is left.
        setAccountId((id) => (id === "all" || list.some((a) => a.id === id) ? id : "all"));
      })
      .catch(() => undefined);
  }, []);

  const params = new URLSearchParams(rangeQuery);
  params.set("page", String(page));
  params.set("limit", "25");
  if (status !== "ALL") params.set("status", status);
  if (debounced) params.set("q", debounced);
  if (accountId !== "all") params.set("instagramAccountId", accountId);
  const { data, loading, error, reload } = useApi<LogsResponse>(`/api/logs?${params}`);

  const logs = data?.logs ?? [];
  const pagination = data?.pagination;
  const first = loading && !data;

  return (
    <div className="space-y-5">
      <div className="panel space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-sm">
            <span className="sr-only">Search logs</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commenter, comment, keyword or campaign"
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-border-hover"
            />
          </label>
          <div className="flex items-center gap-3">
            {accounts.length > 1 && (
              <AccountSelect
                accounts={accounts}
                value={accountId}
                onChange={(id) => {
                  setAccountId(id);
                  setPage(1);
                }}
              />
            )}
            <span className="whitespace-nowrap text-xs text-muted">
              {pagination ? `${pagination.total.toLocaleString()} logs · ${label}` : label}
            </span>
          </div>
        </div>
        <Segmented
          label="Status"
          size="sm"
          options={STATUS_FILTERS}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setPage(1);
          }}
        />
      </div>

      <section className="panel p-4 sm:p-5">
        {error ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-error">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:border-border-hover"
            >
              Try again
            </button>
          </div>
        ) : first ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="No logs match">
            Try another status, a longer date range, or a different search.
          </EmptyState>
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {/* Phone: cards */}
            <ul className="divide-y divide-border sm:hidden">
              {logs.map((log) => (
                <li key={log.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      @{log.commenterName ?? log.commenterId.slice(0, 8)}
                    </span>
                    <StatusBadge status={log.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">{log.commentText}</p>
                  <p className="mt-1 text-xs text-muted">
                    {log.automation.name} · {when(log.createdAt)}
                  </p>
                  {log.errorMessage && log.status === "FAILED" && (
                    <p className="mt-1 text-xs text-error">{log.errorMessage}</p>
                  )}
                </li>
              ))}
            </ul>

            {/* Tablet and up: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    <th className="py-2.5 pr-3">Commenter</th>
                    <th className="px-3 py-2.5">Comment</th>
                    <th className="px-3 py-2.5">Campaign</th>
                    {accounts.length > 1 && <th className="px-3 py-2.5">Account</th>}
                    <th className="px-3 py-2.5">Status</th>
                    <th className="py-2.5 pl-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-surface-hover"
                    >
                      <td className="py-3 pr-3 font-semibold text-foreground">
                        @{log.commenterName ?? log.commenterId.slice(0, 8)}
                      </td>
                      <td className="max-w-[260px] px-3 py-3">
                        <span className="block truncate text-muted" title={log.commentText}>
                          {log.commentText}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-3 py-3">
                        <span className="block truncate text-foreground">{log.automation.name}</span>
                      </td>
                      {accounts.length > 1 && (
                        <td className="px-3 py-3 text-muted">@{log.instagramAccount.username}</td>
                      )}
                      <td className="px-3 py-3">
                        <span title={log.errorMessage ?? undefined}>
                          <StatusBadge status={log.status} />
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3 pl-3 text-right text-muted">
                        {when(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm text-muted">
            <span>
              {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
              {pagination.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:border-border-hover disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs">
                {page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:border-border-hover disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
