"use client";

import { useState, useTransition } from "react";
import { addUnavailableDateAction, removeUnavailableDateAction } from "@/lib/availability/actions";
import { FormMessage } from "@/components/ui/FormMessage";

type Props = {
  initialDates: string[]; // "YYYY-MM-DD", ascending
};

function todayLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(dateString: string): string {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function UnavailableDatesManager({ initialDates }: Props) {
  const [dates, setDates] = useState(initialDates);
  const [newDate, setNewDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const today = todayLocalDateString();
  // Past dates aren't shown prominently (spec section 34) -- the future
  // booking engine ignores them, and V1 doesn't build a cleanup system.
  const upcoming = dates.filter((d) => d >= today);

  function handleAdd() {
    setError(null);
    if (!newDate) {
      setError("Please choose a date.");
      return;
    }
    if (dates.includes(newDate)) {
      setError("That date is already blocked.");
      return;
    }
    startTransition(async () => {
      const result = await addUnavailableDateAction(newDate);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDates((prev) => [...prev, newDate].sort());
      setNewDate("");
    });
  }

  function handleRemove(dateString: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeUnavailableDateAction(dateString);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDates((prev) => prev.filter((d) => d !== dateString));
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Skip a Date</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Block a date completely -- this overrides your monthly availability and any specific-date
          availability for that day. Your recurring schedule continues normally afterward.
        </p>
      </div>

      {error ? <FormMessage variant="error">{error}</FormMessage> : null}

      <div className="flex items-center gap-2">
        <input
          type="date"
          min={today}
          value={newDate}
          onChange={(event) => setNewDate(event.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Adding..." : "Add Date"}
        </button>
      </div>

      {upcoming.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {upcoming.map((dateString) => (
            <li
              key={dateString}
              className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            >
              <span className="text-[var(--color-text)]">{formatDate(dateString)}</span>
              <button
                type="button"
                onClick={() => handleRemove(dateString)}
                disabled={isPending}
                className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-danger)] disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]">No upcoming unavailable dates.</p>
      )}
    </section>
  );
}
