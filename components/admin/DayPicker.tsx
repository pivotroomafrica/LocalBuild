"use client";

import { useRouter } from "next/navigation";

/** Date field that opens the overview on the chosen day. */
export function DayPicker({ day, range }: { day: string; range: number }) {
  const router = useRouter();
  return (
    <input
      type="date"
      className="input day-pick"
      aria-label="Pick a day"
      value={day}
      onChange={(event) => {
        if (event.target.value) router.push(`/admin?range=${range}&day=${event.target.value}#day`, { scroll: false });
      }}
    />
  );
}
