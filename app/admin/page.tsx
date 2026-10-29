import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin/data";
import { getAdminOverview, OVERVIEW_RANGES, type OverviewRange, type OverviewSession } from "@/lib/admin/overview";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { DayPicker } from "@/components/admin/DayPicker";
import { DailyChart } from "@/components/admin/DailyChart";
import { formatEtb } from "@/components/site/format";
import { greeting } from "@/lib/utils/greeting";

function delta(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/** Admin overview (website design). Only real figures; panels with
 * nothing in them are left out rather than filled. */
const STATE_TAG: Record<OverviewSession["state"], { label: string; className: string }> = {
  live: { label: "In session", className: "rtag dark" },
  done: { label: "Finished", className: "rtag grey" },
  upcoming: { label: "Confirmed", className: "rtag" },
  unpaid: { label: "Awaiting payment", className: "rtag grey" },
};

function SessionRows({ sessions, showDate = false }: { sessions: OverviewSession[]; showDate?: boolean }) {
  return (
    <div className="rows">
      {sessions.map((session) => (
        <Link key={session.reference} href={`/admin/bookings/${session.reference}`}>
          <span className="stack" style={{ gap: 0 }}>
            <span className="d num" style={{ fontSize: 17 }}>
              {session.time}
            </span>
            {showDate ? (
              <span className="muted" style={{ fontSize: 12 }}>
                {session.date}
              </span>
            ) : null}
          </span>
          <span className="stack" style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>
              {session.customer} → {session.expert}
            </span>
            <span className="muted" style={{ fontSize: 14 }}>
              {session.format} · {session.reference}
            </span>
          </span>
          <span className={STATE_TAG[session.state].className}>{STATE_TAG[session.state].label}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  const params = await searchParams;
  const rangeParam = Number(params.range);
  const range: OverviewRange = (OVERVIEW_RANGES as readonly number[]).includes(rangeParam)
    ? (rangeParam as OverviewRange)
    : 30;
  const dayParam = typeof params.day === "string" ? params.day : undefined;

  const supabase = await createClient();
  const admin = await requireAdminPage(supabase);
  const data = await getAdminOverview(supabase, range, dayParam);

  const firstName = (admin.full_name ?? "").split(/\s+/)[0];
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Addis_Ababa",
  });
  const change = delta(data.booked, data.bookedPrev);
  const tookPlacePct =
    data.tookPlace + data.cancelled > 0
      ? `${Math.round((data.tookPlace / (data.tookPlace + data.cancelled)) * 100)}%`
      : "—";
  const selected = data.daily.find((d) => d.day === data.selectedDay);
  const selectedLabel = new Date(`${data.selectedDay}T12:00:00+03:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Addis_Ababa",
  });
  const isTodaySelected = selected?.isToday ?? false;

  return (
    <div className="stack" style={{ gap: 28 }}>
      <AutoRefresh seconds={30} />
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="ws-h1">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {today} ·{" "}
          {data.decisions.length === 0
            ? "Nothing needs a decision"
            : `${data.decisions.length} ${data.decisions.length === 1 ? "thing needs" : "things need"} a decision`}{" "}
          · <span className="live-note">Live, updated {data.updatedAt}</span>
        </p>
      </div>

      <nav className="range-tabs" aria-label="Period">
        {OVERVIEW_RANGES.map((r) => (
          <Link
            key={r}
            href={`/admin?range=${r}${dayParam ? `&day=${dayParam}` : ""}`}
            className={r === range ? "on" : undefined}
            aria-current={r === range ? "true" : undefined}
            scroll={false}
          >
            {r} days
          </Link>
        ))}
      </nav>

      <div className="stats">
        <div className="stat">
          <span className="k">Sessions booked, {range} days</span>
          <span className="v num">{data.booked}</span>
          <span className="s">
            {change ? (
              <>
                <span className="up">{change}</span> vs previous {range}
              </>
            ) : (
              "Paid bookings"
            )}
          </span>
        </div>
        <div className="stat">
          <span className="k">Clients paid, {range} days</span>
          <span className="v num">{formatEtb(data.paid)}</span>
          <span className="s">Verified payments, VAT included</span>
        </div>
        <div className="stat">
          <span className="k">Pivotroom commission</span>
          <span className="v num">{formatEtb(data.commission)}</span>
          <span className="s">20% of sessions held in {range} days</span>
        </div>
        <div className="stat">
          <span className="k">Sessions that took place</span>
          <span className="v num">{tookPlacePct}</span>
          <span className="s">
            {data.tookPlace} held · {data.cancelled} cancelled
          </span>
        </div>
      </div>

      <div className="two">
        <div className="stack" style={{ gap: 16 }}>
          <section className="panel stack" style={{ gap: 16 }}>
            <div className="stack" style={{ gap: 4 }}>
              <h2 className="ws-h2">Sessions day by day</h2>
              <span className="muted" style={{ fontSize: 14 }}>
                Paid sessions, last {range} days and the week ahead. Click a day to see its sessions.
              </span>
            </div>
            <DailyChart daily={data.daily} range={range} selectedDay={data.selectedDay} />
          </section>

          <section id="day" className="panel stack" style={{ gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                marginBlockEnd: 8,
              }}
            >
              <div className="stack" style={{ gap: 2 }}>
                <h2 className="ws-h2">{isTodaySelected ? "Today's sessions" : `Sessions on ${selectedLabel}`}</h2>
                {selected ? (
                  <span className="muted" style={{ fontSize: 14 }}>
                    {selected.sessions} paid {selected.sessions === 1 ? "session" : "sessions"} · {selected.booked}{" "}
                    {selected.booked === 1 ? "booking" : "bookings"} made this day
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!isTodaySelected ? (
                  <Link href={`/admin?range=${range}#day`} scroll={false} className="link-arrow">
                    Today
                  </Link>
                ) : null}
                <DayPicker day={data.selectedDay} range={range} />
              </div>
            </div>
            {data.daySessions.length > 0 ? (
              <SessionRows sessions={data.daySessions} />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No sessions {isTodaySelected ? "today" : "on this day"}.
              </p>
            )}
          </section>

          <section className="panel stack" style={{ gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                marginBlockEnd: 8,
              }}
            >
              <h2 className="ws-h2">Coming up next</h2>
              <Link href="/admin/bookings" className="link-arrow">
                All bookings{" "}
                <span className="ms af" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
            {data.upcoming.length > 0 ? (
              <SessionRows sessions={data.upcoming} showDate />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No paid sessions coming up.
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
