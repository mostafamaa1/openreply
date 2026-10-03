"use client";

/**
 * Mobile Tab Bar
 *
 * Phones get the four most used pages one thumb away; everything else opens
 * from "More" (the sidebar drawer).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { NAV_ITEMS } from "@/components/nav-items";

export default function MobileTabs({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const tabs = NAV_ITEMS.filter((item) => item.tab);
  const onTab = tabs.some(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`)
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-bar-line bg-bar text-bar-fg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  active ? "text-accent" : "text-bar-muted"
                }`}
              >
                <span
                  className={`absolute top-0 h-0.5 w-8 rounded-b bg-accent transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Icon className="h-5 w-5" strokeWidth={2} />
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            className={`flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              onTab ? "text-bar-muted" : "text-accent"
            }`}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
