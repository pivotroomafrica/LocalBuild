import Link from "next/link";

export type WorkspaceTab = { href: string; label: string };

/**
 * Section tabs for the signed-in workspaces (customer dashboard, expert
 * application, expert operations, admin) -- intro's category-pill strip,
 * with the current section as the dark active pill.
 */
export function WorkspaceTabs({ tabs, current, label }: { tabs: WorkspaceTab[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="no-scrollbar -mx-5 mb-8 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
      {tabs.map((tab) => {
        const isActive = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`experts-cat-pill ${isActive ? "active" : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
