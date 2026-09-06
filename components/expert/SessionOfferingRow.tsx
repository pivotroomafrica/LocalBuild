"use client";

import { useActionState, useState } from "react";
import {
  deleteSessionOfferingAction,
  updateSessionOfferingAction,
  type ExpertActionState,
} from "@/lib/expert/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import type { ExpertSessionType } from "@/types/expert";

const initialState: ExpertActionState = {};

export function SessionOfferingRow({ offering }: { offering: ExpertSessionType }) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction, isUpdating] = useActionState(
    updateSessionOfferingAction,
    initialState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteSessionOfferingAction,
    initialState,
  );

  if (isEditing) {
    return (
      <form
        action={updateAction}
        className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <input type="hidden" name="offering_id" value={offering.id} />
        {updateState.error ? <FormMessage variant="error">{updateState.error}</FormMessage> : null}

        <p className="text-sm font-medium">{offering.duration_minutes} Minutes</p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`price-${offering.id}`} className="text-sm font-medium">
            Base Price (ETB)
          </label>
          <input
            id={`price-${offering.id}`}
            name="base_price"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={offering.base_price}
            required
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="online_enabled"
              defaultChecked={offering.online_enabled}
              className="h-4 w-4"
            />
            Online
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="in_person_enabled"
              defaultChecked={offering.in_person_enabled}
              className="h-4 w-4"
            />
            In Person
          </label>
        </div>

        <div className="flex gap-2">
          <Button type="submit" isLoading={isUpdating} loadingText="Saving...">
            Save
          </Button>
          <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <p className="text-sm font-medium text-[var(--color-text)]">
          {offering.duration_minutes} Minutes
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Base Price: {Number(offering.base_price).toLocaleString()} {offering.currency}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {[
            offering.online_enabled ? "Online" : null,
            offering.in_person_enabled ? "In Person" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {deleteState.error ? (
          <p className="mt-1 text-xs text-[var(--color-danger)]">{deleteState.error}</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
        <form action={deleteAction}>
          <input type="hidden" name="offering_id" value={offering.id} />
          <Button type="submit" variant="secondary" isLoading={isDeleting} loadingText="Removing...">
            Remove
          </Button>
        </form>
      </div>
    </div>
  );
}
