import Link from "next/link";
import type { OverviewDay } from "@/lib/admin/overview";

/** Paid sessions per day (by session date and by booking date); each day links to its session list. */
export function DailyChart({
  daily,
  range,
  selectedDay,
}: {
  daily: OverviewDay[];
  range: number;
  selectedDay: string;
}) {
  const maxDay = Math.max(1, ...daily.map((d) => Math.max(d.sessions, d.booked)));
  // Label every day on a week view; thin labels out on longer ones.
  const labelEvery = range === 7 ? 1 : range === 30 ? 3 : 7;
  const todayIndex = daily.findIndex((d) => d.isToday);
  // Dates near "Today" are left blank so the labels don't run into each other.
  const labelFor = (d: OverviewDay, i: number) => {
    if (d.isToday) return "Today";
    if (range === 7) return d.label.replace(/ \w+$/, "");
    if (i % labelEvery !== 0 || Math.abs(i - todayIndex) < Math.ceil(labelEvery / 2) + 1) return "";
    return d.label.replace(/^\w+ /, "");
  };
  return (
    <>
      <div className="dchart-legend" aria-hidden="true">
        <span>
          <i className="k-session" /> Session takes place
        </span>
        <span>
          <i className="k-booked" /> Booking made
        </span>
      </div>
      <div
        className="dchart"
        style={{ "--cols": daily.length } as React.CSSProperties}
        role="list"
        aria-label="Paid sessions per day"
      >
        {daily.map((d, i) => (
          <Link
            key={d.day}
            role="listitem"
            href={`/admin?range=${range}&day=${d.day}#day`}
            scroll={false}
            className={["dcol", d.isToday ? "today" : "", d.isFuture ? "future" : "", d.day === selectedDay ? "on" : ""]
              .filter(Boolean)
              .join(" ")}
            title={`${d.label}: ${d.sessions} ${d.sessions === 1 ? "session" : "sessions"}, ${d.booked} booked`}
            aria-label={`${d.label}: ${d.sessions} sessions take place, ${d.booked} bookings made`}
          >
            <span className="bars">
              <span className="bs" style={{ height: `${(d.sessions / maxDay) * 100}%` }}>
                {range === 7 && d.sessions > 0 ? <b>{d.sessions}</b> : null}
              </span>
              <span className="bb" style={{ height: `${(d.booked / maxDay) * 100}%` }}>
                {range === 7 && d.booked > 0 ? <b>{d.booked}</b> : null}
              </span>
            </span>
            <span className="dl">{labelFor(d, i)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
