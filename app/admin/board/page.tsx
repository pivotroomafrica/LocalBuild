import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BOARD_VIEWS, getAdminBoard, type BoardView } from "@/lib/admin/board";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { KanbanBoard } from "@/components/admin/KanbanBoard";

const LIST_HREF: Record<BoardView, string> = {
  bookings: "/admin/bookings",
  applications: "/admin/experts",
  payments: "/admin/payments",
};

/** Bookings, applications and payments as status columns, one board at a time. */
export default async function AdminBoardPage({ searchParams }: PageProps<"/admin/board">) {
  const params = await searchParams;
  const view: BoardView = BOARD_VIEWS.some((v) => v.view === params.view) ? (params.view as BoardView) : "bookings";
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const showAll = typeof params.all === "string" ? params.all : "";

  const supabase = await createClient();
  const all = await getAdminBoard(supabase, view);
  const term = query.toLowerCase();
  const columns = term
    ? all.map((col) => ({
        ...col,
        cards: col.cards.filter((card) =>
          [card.title, card.subtitle, card.meta].some((value) => value.toLowerCase().includes(term)),
        ),
      }))
    : all;
  const total = columns.reduce((sum, col) => sum + col.cards.length, 0);
  const base = `/admin/board?view=${view}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <AutoRefresh seconds={60} />
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="ws-h1">Board</h1>
        <p className="muted" style={{ margin: 0 }}>
          Everything at a glance, column by status. Open a card to act on it.
        </p>
      </div>

      <div className="kb-bar">
        <nav className="range-tabs" aria-label="Choose a board">
          {BOARD_VIEWS.map((v) => (
            <Link
              key={v.view}
              href={`/admin/board?view=${v.view}`}
              className={v.view === view ? "on" : undefined}
              aria-current={v.view === view ? "page" : undefined}
            >
              <span className="ms" aria-hidden="true">
                {v.icon}
              </span>
              {v.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/board" className="kb-search">
          <input type="hidden" name="view" value={view} />
          <input
            name="q"
            type="search"
            className="input"
            defaultValue={query}
            placeholder={view === "applications" ? "Search name or headline" : "Search name or reference"}
            aria-label="Search this board"
          />
        </form>
        <Link href={LIST_HREF[view]} className="link-arrow">
          List view{" "}
          <span className="ms af" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {total} {total === 1 ? "item" : "items"}
        {query ? ` matching “${query}”` : ""}
      </p>

      <KanbanBoard columns={columns} label={`${view} board`} expandBase={base} expanded={showAll} />
    </div>
  );
}
