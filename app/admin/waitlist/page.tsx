import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WaitlistSwitch } from "@/components/admin/WaitlistSwitch";

export const metadata = { title: "Waitlist" };

/** Admin: the waitlist switch (070) and everyone who joined the list. */
export default async function AdminWaitlistPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const supabase = await createClient();
  const query = q.trim().slice(0, 80);

  let list = supabase
    .from("waitlist_signups")
    .select("id, full_name, email, phone, country, city, interest, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(500);
  if (query) {
    const like = `%${query.replace(/[\\%_,()]/g, " ")}%`;
    list = list.or(`full_name.ilike.${like},email.ilike.${like},city.ilike.${like},interest.ilike.${like}`);
  }

  const [{ data: on }, { data: rows, count }, { count: total }] = await Promise.all([
    supabase.rpc("waitlist_mode"),
    list,
    supabase.from("waitlist_signups").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <h1 className="ws-h1">Waitlist</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Show visitors a waitlist page instead of the site, and see who has joined.
        </p>
      </div>

      <WaitlistSwitch initialOn={on === true} />

      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        <Link href="/waitlist">Preview the waitlist page</Link> (admins can open it any time).
      </p>

      <section className="stack" style={{ gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <h2 className="ws-h2" style={{ margin: 0 }}>
            People on the list <span className="muted">({total ?? 0})</span>
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <form action="/admin/waitlist" style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                name="q"
                defaultValue={query}
                placeholder="Search name, email, city…"
                style={{ minWidth: 0, width: 240 }}
              />
              <button type="submit" className="btn btn-line md">
                Search
              </button>
            </form>
            <a href="/admin/waitlist/export" className="btn btn-ink md">
              Download CSV
            </a>
          </div>
        </div>

        {(rows ?? []).length === 0 ? (
          <p className="notice" style={{ margin: 0 }}>
            {query ? "Nobody matches that search." : "Nobody has joined the waitlist yet."}
          </p>
        ) : (
          <div className="wlt-wrap">
            <table className="wlt">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Place</th>
                  <th>Wants help with</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.full_name}</td>
                    <td>
                      <a href={`mailto:${row.email}`}>{row.email}</a>
                      {row.phone ? <div className="muted">{row.phone}</div> : null}
                    </td>
                    <td>{[row.city, row.country].filter(Boolean).join(", ") || "—"}</td>
                    <td className="wlt-interest">{row.interest || <span className="muted">—</span>}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>
                      {new Date(row.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {query && count != null ? <p className="muted">{count} found.</p> : null}
          </div>
        )}
      </section>
    </div>
  );
}
