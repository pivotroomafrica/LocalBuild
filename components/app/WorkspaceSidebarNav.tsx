"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarItem = { href: string; label: string; icon: string; badge?: number; exact?: boolean };

/** Sidebar sections; on phones the same list becomes a scrolling row. */
export function WorkspaceSidebarNav({ items, switchTo }: { items: SidebarItem[]; switchTo: SidebarItem[] }) {
  const pathname = usePathname();
  const isCurrent = (item: SidebarItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <>
      <nav className="ws-nav" aria-label="Sections">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isCurrent(item) ? "ws-link on" : "ws-link"}
            aria-current={isCurrent(item) ? "page" : undefined}
          >
            <span className="ms" aria-hidden="true">
              {item.icon}
            </span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge ? (
              <span className="ws-count num" aria-label={`${item.badge} waiting`}>
                {item.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      {switchTo.length > 0 ? (
        <nav className="ws-nav ws-switch" aria-label="Switch workspace">
          {switchTo.map((item) => (
            <Link key={item.href} href={item.href} className="ws-link">
              <span className="ms" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}
