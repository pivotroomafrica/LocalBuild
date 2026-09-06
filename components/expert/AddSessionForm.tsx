"use client";

import { useActionState } from "react";
import { addSessionOfferingAction, type ExpertActionState } from "@/lib/expert/actions";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { SESSION_DURATIONS } from "@/types/expert";

const initialState: ExpertActionState = {};

export function AddSessionForm({ usedDurations }: { usedDurations: number[] }) {
  const [state, formAction, isPending] = useActionState(addSessionOfferingAction, initialState);

  const availableDurations = SESSION_DURATIONS.filter((d) => !usedDurations.includes(d));

  if (availableDurations.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        You have an offering for every supported duration.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-dashed border-[var(--color-border)] p-4"
    >
      <h3 className="text-sm font-semibold">Add Session</h3>
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <SelectField
        label="Duration"
        name="duration_minutes"
        options={availableDurations.map((d) => ({ value: String(d), label: `${d} Minutes` }))}
        required
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="base_price" className="text-sm font-medium">
          Base Price (ETB)
        </label>
        <input
          id="base_price"
          name="base_price"
          type="number"
          min="0.01"
          step="0.01"
          required
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base"
        />
      </div>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="online_enabled" className="h-4 w-4" />
          Online
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="in_person_enabled" className="h-4 w-4" />
          In Person
        </label>
      </div>

      <Button type="submit" isLoading={isPending} loadingText="Adding...">
        Add Session
      </Button>
    </form>
  );
}
