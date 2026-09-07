import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminExpertList, ADMIN_EXPERT_TABS, type AdminExpertTab } from "@/lib/admin/data";

const VALID_TABS = new Set(ADMIN_EXPERT_TABS.map((t) => t.tab));

function isValidTab(value: string | undefined): value is AdminExpertTab {
  return Boolean(value && VALID_TABS.has(value as AdminExpertTab));
}

export default async function AdminExpertsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const params = await searchParams;
  const tab: AdminExpertTab = isValidTab(params.tab) ? params.tab : "submitted";
  const search = params.q?.trim() ?? "";

  const supabase = await createClient();
  const rows = await getAdminExpertList(supabase, tab, search);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Expert Applications</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Review, approve, and publish expert applications.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {ADMIN_EXPERT_TABS.map((t) => (
          <Link
            key={t.tab}
            href={`/admin/experts?tab=${t.tab}`}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              t.tab === tab
                ? "border-b-2 border-[var(--color-brand)] text-[var(--color-brand)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Search by name, headline, or company"
          className="w-full max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        />
        <button
          type="submit"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
        >
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No applications in this view.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/experts/${row.id}`}
                className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-brand)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{row.full_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {[row.headline, row.current_company].filter(Boolean).join(" · ") || "No headline yet"}
                  </p>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {row.submitted_at ? `Submitted ${new Date(row.submitted_at).toLocaleDateString()}` : "Not submitted"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
