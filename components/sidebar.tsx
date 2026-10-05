"use client";

/**
 * Sidebar Navigation
 *
 * The navy rail of the broadcast world: grouped sections with icons, the
 * current page marked by a yellow tab. Slides in as a drawer on phones.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { NAV_GROUPS } from "@/components/nav-items";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
}

export default function Sidebar({ isOpen, onClose, workspaceName }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#020814]/60 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 flex h-dvh w-64 max-w-[85vw] shrink-0 flex-col bg-bar text-bar-fg
          transition-transform duration-200 ease-out
          lg:static lg:z-auto lg:h-full lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div
          className="flex items-center justify-between px-5 pb-4"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent font-display text-lg font-bold leading-none text-on-accent">
              O
            </span>
            <span className="font-display text-xl font-bold uppercase tracking-wide">
              OpenReply
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-bar-muted hover:text-bar-fg lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-bar-muted">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? "bg-white/10 font-semibold text-bar-fg"
                            : "text-bar-muted hover:bg-white/5 hover:text-bar-fg"
                        }`}
                      >
                        <Icon
                          className={`h-[18px] w-[18px] ${active ? "text-accent" : ""}`}
                          strokeWidth={2}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-bar-line px-5 py-4">
          <p className="truncate text-sm font-medium text-bar-fg">{workspaceName}</p>
          <p className="text-xs text-bar-muted">Self-hosted</p>
        </div>
      </aside>
    </>
  );
}
