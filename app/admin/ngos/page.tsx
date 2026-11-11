import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddNgoForm, RenameNgoForm } from "@/components/admin/NgoForms";
import { setNgoActiveAction } from "@/lib/admin/ngoActions";

/** Admin: the NGOs experts can pledge part of their earnings to. */
export default async function AdminNgosPage() {
  const supabase = await createClient();
  const [{ data: ngos }, { data: pledges }] = await Promise.all([
    supabase.from("ngos").select("id, name, is_active").order("name"),
    supabase
      .from("expert_profiles")
      .select("id, supported_ngo_id, donation_percent, profiles!expert_profiles_user_id_fkey(full_name)")
      .not("supported_ngo_id", "is", null),
  ]);

  const supporters = new Map<string, { id: string; name: string; percent: number | null }[]>();
  for (const row of pledges ?? []) {
    const list = supporters.get(row.supported_ngo_id!) ?? [];
    list.push({
      id: row.id,
      name: (row.profiles as { full_name: string } | null)?.full_name ?? "Expert",
      percent: row.donation_percent,
    });
    supporters.set(row.supported_ngo_id!, list);
  }
  const all = ngos ?? [];
  const active = all.filter((ngo) => ngo.is_active);
  const hidden = all.filter((ngo) => !ngo.is_active);

  const row = (ngo: (typeof all)[number]) => {
    const backers = supporters.get(ngo.id) ?? [];
    return (
      <li key={ngo.id} className="ngo-row">
        <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
          <RenameNgoForm id={ngo.id} name={ngo.name} />
          {backers.length > 0 ? (
            <span className="muted" style={{ fontSize: 13 }}>
              Supported by{" "}
              {backers.map((b, i) => (
                <span key={b.id}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/admin/experts/${b.id}`}>{b.name}</Link> ({b.percent}%)
                </span>
              ))}
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              No experts yet
            </span>
          )}
        </div>
        <form action={setNgoActiveAction}>
          <input type="hidden" name="id" value={ngo.id} />
          <input type="hidden" name="active" value={ngo.is_active ? "false" : "true"} />
          <button type="submit" className="btn btn-line">
            {ngo.is_active ? "Hide" : "Show again"}
          </button>
        </form>
      </li>
    );
  };

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="ws-h1">NGOs</h1>
        <p className="muted" style={{ margin: 0, maxWidth: "64ch" }}>
          Organisations experts can give part of their earnings to. An expert who picks one gets a gold verified mark,
          and their profile shows the organisation and percentage. Hiding an organisation removes it from the list and
          from every profile that chose it.
        </p>
      </div>

      <section className="panel stack" style={{ gap: 12 }}>
        <h2 className="ws-h2">Add an organisation</h2>
        <AddNgoForm />
      </section>

      <section className="panel stack" style={{ gap: 8 }}>
        <h2 className="ws-h2">On the list ({active.length})</h2>
        <ul className="ngo-list">{active.map(row)}</ul>
      </section>

      {hidden.length > 0 ? (
        <section className="panel stack" style={{ gap: 8 }}>
          <h2 className="ws-h2">Hidden ({hidden.length})</h2>
          <ul className="ngo-list">{hidden.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
