/** Intro-style calendar tile (month over day) for session lists, in the
 * same timezone the row's own date/time line is formatted in. */
export function SessionDateTile({ startAt, timezone }: { startAt: string; timezone: string | null }) {
  const date = new Date(startAt);
  const timeZone = timezone ?? "UTC";
  const month = date.toLocaleString(undefined, { month: "short", timeZone });
  const day = date.toLocaleString(undefined, { day: "numeric", timeZone });
  return (
    <div
      aria-hidden="true"
      className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">{month}</span>
      <span className="text-xl font-extrabold leading-none tracking-[-0.02em] text-[var(--color-text)]">{day}</span>
    </div>
  );
}
