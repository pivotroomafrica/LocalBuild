"use client";

import { useActionState } from "react";
import { issueReceiptAction, type ReceiptActionState } from "@/lib/receipts/actions";

const initialState: ReceiptActionState = {};

/** Admin: attach the receipt file (optional) and mark the request sent. */
export function IssueReceiptForm({ id }: { id: string }) {
  const [state, formAction, isPending] = useActionState(issueReceiptAction, initialState);
  return (
    <form action={formAction} className="rc-issue">
      <input type="hidden" name="id" value={id} />
      <label className="rc-file">
        <span className="muted" style={{ fontSize: 13 }}>
          Receipt file (PDF or photo, optional)
        </span>
        <input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
      </label>
      <button type="submit" className="btn btn-ink" disabled={isPending}>
        {isPending ? "Sending…" : "Mark as sent"}
      </button>
      {state.error ? (
        <p className="notice err" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
