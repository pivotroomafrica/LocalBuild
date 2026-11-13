"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { adminDeletePersonAction } from "@/lib/admin/deletePersonAction";
import type { AdminActionState } from "@/lib/admin/actions";

const initialState: AdminActionState = {};

type Impact = {
  bookingsAsClient: number;
  bookingsAsExpert: number;
  paidSessions: number;
  payments: number;
  reviews: number;
  files: number;
  upcoming: { reference: string; startAt: string; side: "client" | "expert" }[];
};

/**
 * "Delete account": lists exactly what goes, refuses while sessions are
 * upcoming, and needs the full name typed before the button works.
 */
export function DeletePersonPanel({
  userId,
  fullName,
  isExpert,
  impact,
}: {
  userId: string;
  fullName: string;
  isExpert: boolean;
  impact: Impact;
}) {
  const [state, formAction, isPending] = useActionState(adminDeletePersonAction, initialState);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().replace(/\s+/g, " ").toLowerCase() === fullName.trim().replace(/\s+/g, " ").toLowerCase();
  const blocked = impact.upcoming.length > 0;

  const lines = [
    "Their login and profile",
    isExpert ? "Their expert profile, photo and availability" : null,
    impact.bookingsAsClient ? `${impact.bookingsAsClient} session${impact.bookingsAsClient === 1 ? "" : "s"} they booked as a client` : null,
    impact.bookingsAsExpert ? `${impact.bookingsAsExpert} session${impact.bookingsAsExpert === 1 ? "" : "s"} they hosted as an expert` : null,
    impact.payments ? `${impact.payments} payment record${impact.payments === 1 ? "" : "s"}` : null,
    impact.reviews ? `${impact.reviews} review${impact.reviews === 1 ? "" : "s"}` : null,
    impact.files ? `${impact.files} uploaded file${impact.files === 1 ? "" : "s"} (photo, receipts)` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 bg-[var(--color-surface)] p-5">
      <div>
        <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-[var(--color-danger)]">Delete account</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Permanently removes {fullName} and everything tied to them. This can&apos;t be undone.
        </p>
      </div>

      {blocked ? (
        <div className="notice err" style={{ margin: 0 }}>
          <p className="m-0">
            {fullName} has {impact.upcoming.length} upcoming session{impact.upcoming.length === 1 ? "" : "s"}. Cancel{" "}
            {impact.upcoming.length === 1 ? "it" : "them"} first so nobody is left waiting:
          </p>
          <ul className="mb-0 mt-2 pl-5">
            {impact.upcoming.map((u) => (
              <li key={u.reference}>
                <Link href={`/admin/bookings/${u.reference}`} className="underline">
                  {u.reference}
                </Link>{" "}
                · {new Date(u.startAt).toLocaleString()} · as {u.side}
              </li>
            ))}
          </ul>
        </div>
      ) : !open ? (
        <button
          type="button"
          className="w-fit rounded-full border border-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
          onClick={() => setOpen(true)}
        >
          Delete {isExpert ? "expert" : "client"}…
        </button>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="user_id" value={userId} />
          <div>
            <p className="m-0 text-sm font-semibold">This will permanently delete:</p>
            <ul className="mb-0 mt-1 pl-5 text-sm">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {impact.paidSessions ? (
              <p className="mb-0 mt-2 text-sm text-[var(--color-danger)]">
                {impact.paidSessions} of these sessions were paid. Their records leave your payment history and the other
                person&apos;s session list too.
              </p>
            ) : null}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span>
              Type <strong>{fullName}</strong> to confirm
            </span>
            <input
              name="confirm_name"
              className="input"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              style={{ minHeight: 40, paddingBlock: 8 }}
            />
          </label>
          {state.error ? (
            <p className="notice err" role="alert" style={{ margin: 0 }}>
              {state.error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!matches || isPending}
              className="rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              type="button"
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
