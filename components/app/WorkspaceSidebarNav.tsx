"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarItem = { href: string; label: string; icon: string; badge?: number; exact?: boolean };

/**
 * Sidebar sections. On phones the list becomes a scrolling row, or, with
 * `picker` (admin), a "current section" button that opens a grid of all
 * sections with their waiting counts.
 */
export function WorkspaceSidebarNav({
  items,
  switchTo,
  picker = false,
}: {
  items: SidebarItem[];
  switchTo: SidebarItem[];
  picker?: boolean;
}) {
  const pathname = usePathname();
  const isCurrent = (item: SidebarItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const current = items.find(isCurrent) ?? items[0];
  const waiting = items.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <>
      {picker ? (
        // Keyed by the page, so it closes again after you pick a section.
        <details key={pathname} className="ws-pick">
          <summary>
            <span className="ws-pick-icon ms" aria-hidden="true">
              {current.icon}
            </span>
            <span className="ws-pick-text">
              <span className="ws-pick-label">Section</span>
              <span className="ws-pick-name">{current.label}</span>
            </span>
            {waiting > 0 ? (
              <span className="ws-count num" aria-label={`${waiting} waiting`}>
                {waiting}
              </span>
            ) : null}
            <span className="ws-pick-chev ms" aria-hidden="true">
              expand_more
            </span>
          </summary>
          <div className="ws-pick-grid">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isCurrent(item) ? "ws-tile on" : "ws-tile"}
                aria-current={isCurrent(item) ? "page" : undefined}
              >
                <span className="ms" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="ws-tile-label">{item.label}</span>
                {item.badge ? (
                  <span className="ws-count num" aria-label={`${item.badge} waiting`}>
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
          {switchTo.length > 0 ? (
            <div className="ws-pick-switch">
              {switchTo.map((item) => (
                <Link key={item.href} href={item.href}>
                  <span className="ms" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </details>
      ) : null}
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
