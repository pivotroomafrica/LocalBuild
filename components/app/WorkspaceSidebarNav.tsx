"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  exact?: boolean;
  /** Shown on the phone's bottom bar (the rest go under "More"). */
  dock?: boolean;
};

/**
 * Sidebar sections. On phones the list becomes a scrolling row, or, with
 * `picker` (admin), a floating bar at the bottom of the screen.
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
  // The bar shows the sections marked `dock`; "More" holds the rest.
  const dockItems = items.filter((item) => item.dock);
  const moreItems = items.filter((item) => !item.dock);
  const moreOn = moreItems.some(isCurrent);
  const moreWaiting = moreItems.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  return (
    <>
      {picker ? (
        // Phones: a floating bar at the bottom with the main sections and
        // "More" for the rest. Keyed by the page, so "More" closes again
        // after you pick something.
        <nav key={pathname} className="ws-dock" aria-label="Admin sections">
          {dockItems.map((item) => (
            <DockLink key={item.href} item={item} on={isCurrent(item)} />
          ))}
          <details className="ws-dock-more">
            <summary className={moreOn ? "ws-dock-link on" : "ws-dock-link"}>
              <span className="ws-dock-icon">
                <span className="ms" aria-hidden="true">
                  apps
                </span>
                {moreWaiting > 0 ? (
                  <span className="ws-dock-badge num" aria-label={`${moreWaiting} waiting`}>
                    {moreWaiting}
                  </span>
                ) : null}
              </span>
              <span className="ws-dock-label">More</span>
            </summary>
            <div className="ws-dock-sheet">
              <div className="ws-pick-grid">
                {moreItems.map((item) => (
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
            </div>
          </details>
        </nav>
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

function DockLink({ item, on }: { item: SidebarItem; on: boolean }) {
  return (
    <Link href={item.href} className={on ? "ws-dock-link on" : "ws-dock-link"} aria-current={on ? "page" : undefined}>
      <span className="ws-dock-icon">
        <span className="ms" aria-hidden="true">
          {item.icon}
        </span>
        {item.badge ? (
          <span className="ws-dock-badge num" aria-label={`${item.badge} waiting`}>
            {item.badge}
          </span>
        ) : null}
      </span>
      <span className="ws-dock-label">{item.label}</span>
    </Link>
  );
}
