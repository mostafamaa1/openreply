"use client";

/**
 * Top Bar
 *
 * Page title, the global date range (on pages whose numbers follow it), the
 * theme toggle and the connected account.
 */

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { findNavItem } from "@/components/nav-items";
import { RangePicker } from "@/components/range-context";
import ThemeToggle from "@/components/theme-toggle";

const EXTRA_TITLES: Record<string, string> = {
  "/campaigns/new": "New Campaign",
  "/campaigns/import": "Import Campaigns",
  "/automations": "Campaigns",
  "/automations/new": "New Campaign",
};

interface TopBarProps {
  onMenuClick: () => void;
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function TopBar({
  onMenuClick,
  instagramUsername,
  instagramAccountCount,
}: TopBarProps) {
  const pathname = usePathname();
  const item = findNavItem(pathname);
  const title = EXTRA_TITLES[pathname] ?? item?.label ?? "Dashboard";
  // Only list pages follow the range; a campaign's own page does not.
  const showRange = Boolean(item?.ranged && pathname === item.href);

  return (
    <header
      className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-foreground lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="truncate font-display text-2xl font-bold uppercase tracking-wide text-foreground">
            {title}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showRange && (
            <div className="hidden md:block">
              <RangePicker />
            </div>
          )}
          <ThemeToggle />
          {instagramAccountCount > 0 ? (
            <span className="hidden items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted sm:inline-flex">
              <span className="tally" aria-hidden="true" />
              {instagramAccountCount > 1
                ? `${instagramAccountCount} accounts`
                : `@${instagramUsername}`}
            </span>
          ) : (
            <a
              href="/api/instagram/connect"
              className="whitespace-nowrap rounded-md bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
            >
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">Connect Instagram</span>
            </a>
          )}
        </div>
      </div>

      {showRange && (
        // Phones get the range on its own row, full width, under the title.
        <div className="overflow-x-auto px-4 pb-3 md:hidden">
          <RangePicker />
        </div>
      )}
    </header>
  );
}
