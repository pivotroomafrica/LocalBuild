import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminPeople, type AdminPeopleKind } from "@/lib/admin/people";

const TABS: { kind: AdminPeopleKind; label: string }[] = [
  { kind: "clients", label: "Clients" },
  { kind: "experts", label: "Experts" },
];

const APPLICATION_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
};

export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const params = await searchParams;
  const kind: AdminPeopleKind = params.tab === "experts" ? "experts" : "clients";
  const query = (params.q ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const all = await getAdminPeople(supabase, kind);
  const rows = query
    ? all.filter((row) =>
        [row.full_name, row.email, row.phone, row.city, row.country]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      )
    : all;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)] sm:text-[32px]">
          Clients &amp; experts
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Everyone with an account, with their phone and email. Open someone to see their sessions.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <nav className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--color-border)] bg-[var(--color-mist)] p-1">
          {TABS.map((t) => (
            <Link
              key={t.kind}
              href={`/admin/people?tab=${t.kind}`}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-bold transition-all ${
                t.kind === kind
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_1px_4px_rgba(20,19,24,0.12)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form className="flex min-w-0 flex-1 gap-2" action="/admin/people">
          <input type="hidden" name="tab" value={kind} />
          <input
            name="q"
            type="search"
            defaultValue={params.q ?? ""}
            placeholder="Search name, email, phone or city"
            aria-label="Search people"
            className="input min-w-0 flex-1"
            style={{ minHeight: 40, paddingBlock: 8 }}
          />
        </form>
      </div>

      <p className="text-sm text-[var(--color-text-muted)]">
        {rows.length} {rows.length === 1 ? "person" : "people"}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">Nobody here yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.user_id}>
              <Link
                href={`/admin/people/${row.user_id}`}
                className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition-all hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-raised)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    {row.full_name}
                    {kind === "experts" && row.application_status ? (
                      <span className="ml-2 rounded-full bg-[var(--color-mist)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
                        {row.profile_status === "published"
                          ? "Live"
                          : APPLICATION_LABELS[row.application_status] ?? row.application_status}
                      </span>
                    ) : null}
                  </p>
                  <p className="break-all text-xs text-[var(--color-text-muted)]">
                    {row.email}
                    {row.phone ? ` · ${row.phone}` : ""}
                  </p>
                </div>
                <div className="text-xs text-[var(--color-text-muted)] sm:text-right">
                  <p>{[row.city, row.country].filter(Boolean).join(", ") || "—"}</p>
                  <p>
                    {kind === "experts"
                      ? `${row.bookings_as_expert} sessions hosted`
                      : `${row.bookings_as_client} sessions booked`}{" "}
                    · joined {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
