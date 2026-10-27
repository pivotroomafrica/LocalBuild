import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin/data";
import { getAdminOverview } from "@/lib/admin/overview";
import { formatEtb } from "@/components/site/format";
import { greeting } from "@/lib/utils/greeting";

function delta(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/** Admin overview (website design). Only real figures; panels with
 * nothing in them are left out rather than filled. */
export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const admin = await requireAdminPage(supabase);
  const data = await getAdminOverview(supabase);

  const firstName = (admin.full_name ?? "").split(/\s+/)[0];
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Addis_Ababa",
  });
  const maxWeek = Math.max(1, ...data.weekly.map((week) => week.count));
  const change = delta(data.booked30, data.bookedPrev30);
  const tookPlacePct =
    data.tookPlace30 + data.cancelled30 > 0
      ? `${Math.round((data.tookPlace30 / (data.tookPlace30 + data.cancelled30)) * 100)}%`
      : "—";

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="ws-h1">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {today} ·{" "}
          {data.decisions.length === 0
            ? "Nothing needs a decision"
            : `${data.decisions.length} ${data.decisions.length === 1 ? "thing needs" : "things need"} a decision`}
        </p>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="k">Sessions booked, 30 days</span>
          <span className="v num">{data.booked30}</span>
          <span className="s">
            {change ? (
              <>
                <span className="up">{change}</span> vs previous 30
              </>
            ) : (
              "Paid bookings"
            )}
          </span>
        </div>
        <div className="stat">
          <span className="k">Clients paid, 30 days</span>
          <span className="v num">{formatEtb(data.paid30)}</span>
          <span className="s">Verified payments, VAT included</span>
        </div>
        <div className="stat">
          <span className="k">Pivotroom commission</span>
          <span className="v num">{formatEtb(data.commission30)}</span>
          <span className="s">20% of sessions held in 30 days</span>
        </div>
        <div className="stat">
          <span className="k">Sessions that took place</span>
          <span className="v num">{tookPlacePct}</span>
          <span className="s">
            {data.tookPlace30} held · {data.cancelled30} cancelled
          </span>
        </div>
      </div>

      <div className="two">
        <div className="stack" style={{ gap: 16 }}>
          <section className="panel stack" style={{ gap: 16 }}>
            <div className="stack" style={{ gap: 4 }}>
              <h2 className="ws-h2">Sessions booked per week</h2>
              <span className="muted" style={{ fontSize: 14 }}>
                Paid bookings, last 12 weeks
              </span>
            </div>
            <div className="chart" role="img" aria-label="Paid bookings per week for the last 12 weeks">
              {data.weekly.map((week) => (
                <div key={week.label} className="col" title={`Week of ${week.label}: ${week.count}`}>
                  <span className="n num">{week.count || ""}</span>
                  <span className="b" style={{ height: `${(week.count / maxWeek) * 100}%` }} />
                  <span className="l">{week.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel stack" style={{ gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBlockEnd: 8 }}>
              <h2 className="ws-h2">Today&apos;s sessions</h2>
              <Link href="/admin/bookings" className="link-arrow">
                All bookings{" "}
                <span className="ms af" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
            {data.today.length > 0 ? (
              <div className="rows">
                {data.today.map((session) => (
                  <Link key={session.reference} href={`/admin/bookings/${session.reference}`}>
                    <span className="d num" style={{ fontSize: 17 }}>
                      {session.time}
                    </span>
                    <span className="stack" style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 500 }}>
                        {session.customer} → {session.expert}
                      </span>
                      <span className="muted" style={{ fontSize: 14 }}>
                        {session.format} · {session.reference}
                      </span>
                    </span>
                    <span className={session.state === "live" ? "rtag dark" : session.state === "done" ? "rtag grey" : "rtag"}>
                      {session.state === "live" ? "In session" : session.state === "done" ? "Finished" : "Confirmed"}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No paid sessions today.
              </p>
            )}
          </section>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <section className="panel stack" style={{ gap: 8 }}>
            <h2 className="ws-h2" style={{ marginBlockEnd: 8 }}>
              Needs a decision
            </h2>
            {data.decisions.length > 0 ? (
              <div className="decisions">
                {data.decisions.map((item) => (
                  <Link key={item.title} href={item.href}>
                    <span className="ic" aria-hidden="true">
                      <span className="ms">{item.icon}</span>
                    </span>
                    <span className="stack" style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontWeight: 500 }}>{item.title}</span>
                      <span className="muted" style={{ fontSize: 14 }}>
                        {item.detail}
                      </span>
                    </span>
                    {item.urgent ? <span className="rtag dark">Urgent</span> : null}
                    <span className="ms af" aria-hidden="true">
                      chevron_right
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                All clear.
              </p>
            )}
          </section>

          <section className="panel stack" style={{ gap: 14 }}>
            <h2 className="ws-h2">Marketplace health</h2>
            <div className="stack" style={{ gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Live experts</span>
                <span className="num" style={{ fontWeight: 600 }}>
                  {data.health.liveExperts}
                </span>
              </div>
              <span className="muted" style={{ fontSize: 14 }}>
                {data.health.applying} applying · {data.health.suspended} suspended
              </span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Clients who book again</span>
                <span className="num" style={{ fontWeight: 600 }}>
                  {data.health.returningPct != null ? `${data.health.returningPct}%` : "—"}
                </span>
              </div>
              <div className="meter" aria-hidden="true">
                <span style={{ width: `${data.health.returningPct ?? 0}%` }} />
              </div>
              <span className="muted" style={{ fontSize: 14 }}>
                Of {data.health.payingClients} paying {data.health.payingClients === 1 ? "client" : "clients"}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
