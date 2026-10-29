import Link from "next/link";
import type { BoardColumn } from "@/lib/admin/board";

/** Cards shown per column before "show all". */
const COLUMN_PREVIEW = 30;

/** Status columns of cards; each card links to its detail page. */
export function KanbanBoard({
  columns,
  label,
  expandBase,
  expanded,
}: {
  columns: BoardColumn[];
  label: string;
  /** URL the "Show all" link extends with `&all=<column>`. */
  expandBase: string;
  /** Key of the column showing every card. */
  expanded: string;
}) {
  return (
    <div className="kb" role="list" aria-label={label}>
      {columns.map((col) => {
        const isExpanded = expanded === col.key;
        const cards = isExpanded ? col.cards : col.cards.slice(0, COLUMN_PREVIEW);
        return (
          <section key={col.key} className={`kb-col ${col.tone}`} role="listitem" aria-label={col.label}>
            <header className="kb-head">
              <span className="kb-dot" aria-hidden="true" />
              <h2>{col.label}</h2>
              <span className="kb-count num">{col.cards.length}</span>
            </header>
            <p className="kb-hint">{col.hint}</p>
            <div className="kb-cards">
              {cards.length === 0 ? <p className="kb-empty">Nothing here</p> : null}
              {cards.map((card) => (
                <Link key={card.id} href={card.href} className="kb-card">
                  <span className="kb-title">{card.title}</span>
                  <span className="kb-sub">{card.subtitle}</span>
                  <span className="kb-meta">
                    <span className="num">{card.meta}</span>
                    {card.badge ? <span className={card.warn ? "kb-badge warn" : "kb-badge"}>{card.badge}</span> : null}
                  </span>
                </Link>
              ))}
              {!isExpanded && col.cards.length > COLUMN_PREVIEW ? (
                <Link href={`${expandBase}&all=${col.key}`} className="kb-more" scroll={false}>
                  Show all {col.cards.length}
                </Link>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
