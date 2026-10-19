import Link from "next/link";

export type WorkspaceTab = { href: string; label: string };

/** In-page section tabs (e.g. the expert application steps): the
 * design's square filter chips, current one in blue. */
export function WorkspaceTabs({ tabs, current, label }: { tabs: WorkspaceTab[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="scroller" style={{ marginBlockEnd: 32 }}>
      {tabs.map((tab) => {
        const isActive = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "chip on" : "chip"}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
