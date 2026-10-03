import {
  Activity,
  BarChart3,
  Bot,
  Inbox,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown in the phone tab bar; the rest live behind "More". */
  tab?: boolean;
  /** Pages whose numbers follow the global date range. */
  ranged?: boolean;
}

export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Performance",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, tab: true, ranged: true },
      { label: "Analytics", href: "/overview", icon: BarChart3, tab: true, ranged: true },
      { label: "Agents", href: "/agents", icon: Bot, tab: true },
    ],
  },
  {
    label: "Automation",
    items: [
      { label: "Campaigns", href: "/campaigns", icon: Megaphone, tab: true, ranged: true },
      { label: "Inbox", href: "/inbox", icon: Inbox },
      { label: "DM Logs", href: "/logs", icon: ScrollText, ranged: true },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Diagnostics", href: "/diagnostics", icon: Activity },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
}
