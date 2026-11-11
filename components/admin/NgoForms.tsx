"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addNgoAction, renameNgoAction } from "@/lib/admin/ngoActions";
import type { AdminActionState } from "@/lib/admin/actions";

const initialState: AdminActionState = {};

export function AddNgoForm() {
  const [state, formAction, isPending] = useActionState(addNgoAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="ngo-add">
      <input
        name="name"
        className="input"
        placeholder="Organisation name, e.g. Mekedonia Humanitarian Association"
        aria-label="New organisation name"
        maxLength={160}
        required
      />
      <button type="submit" className="btn btn-ink md" disabled={isPending}>
        {isPending ? "Adding…" : "Add"}
      </button>
      {state.error ? (
        <p className="notice err" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success && !isPending ? (
        <p className="notice" role="status">
          Added. Experts can choose it now.
        </p>
      ) : null}
    </form>
  );
}

export function RenameNgoForm({ id, name }: { id: string; name: string }) {
  const [state, formAction, isPending] = useActionState(renameNgoAction, initialState);
  const [editing, setEditing] = useState(false);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.success) setEditing(false);
  }

  if (!editing) {
    return (
      <span className="ngo-name">
        {name}
        <button type="button" className="ngo-edit" onClick={() => setEditing(true)} aria-label={`Rename ${name}`}>
          <span className="ms" aria-hidden="true">
            edit
          </span>
        </button>
      </span>
    );
  }
  return (
    <form action={formAction} className="ngo-rename">
      <input type="hidden" name="id" value={id} />
      <input name="name" className="input" defaultValue={name} maxLength={160} required aria-label="Name" autoFocus />
      <button type="submit" className="btn btn-ink" disabled={isPending}>
        Save
      </button>
      <button type="button" className="btn btn-line" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {state.error ? (
        <p className="notice err" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
