"use client";

import { useActionState } from "react";
import { requestReceiptAction, type ReceiptActionState } from "@/lib/receipts/actions";

const initialState: ReceiptActionState = {};

export type ReceiptView = {
  status: "requested" | "issued";
  receiptName: string;
  requestedAt: string;
  issuedAt: string | null;
  downloadUrl: string | null;
} | null;

const card =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]";
const heading = "mb-3 text-[15px] font-extrabold tracking-[-0.01em] text-[var(--color-text)]";
const field =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-mist)] bg-[var(--color-mist)] px-4 py-3 text-base text-[var(--color-text)] focus-visible:border-[var(--color-accent)] focus-visible:bg-[var(--color-surface)] focus-visible:outline-none";

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Paid session: ask for a receipt, then see its status and download it. */
export function ReceiptPanel({
  bookingReference,
  defaultName,
  receipt,
}: {
  bookingReference: string;
  defaultName: string;
  receipt: ReceiptView;
}) {
  const [state, formAction, isPending] = useActionState(requestReceiptAction, initialState);

  if (receipt?.status === "issued") {
    return (
      <section className={card}>
        <h2 className={heading}>Receipt</h2>
        <p className="text-sm text-[var(--color-text)]">
          Your receipt in the name of <strong>{receipt.receiptName}</strong> was sent on{" "}
          {receipt.issuedAt ? day(receipt.issuedAt) : "—"}.
        </p>
        {receipt.downloadUrl ? (
          <a
            href={receipt.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-accent)] hover:underline"
          >
            <span className="ms" aria-hidden="true" style={{ fontSize: 18 }}>
              download
            </span>
            Download receipt
          </a>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">We sent it to your email.</p>
        )}
      </section>
    );
  }

  if (receipt?.status === "requested" || state.success) {
    return (
      <section className={card}>
        <h2 className={heading}>Receipt</h2>
        <p className="text-sm text-[var(--color-text)]">
          You asked for a receipt{receipt ? ` on ${day(receipt.requestedAt)}` : ""}. Our team is preparing it and will
          email you when it&apos;s ready. You&apos;ll also be able to download it here.
        </p>
      </section>
    );
  }

  return (
    <section className={card}>
      <h2 className={heading}>Need a receipt?</h2>
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        Ask for an official receipt for this payment. We&apos;ll email you when it&apos;s ready.
      </p>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="booking_reference" value={bookingReference} />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--color-text)]">
          Name or company on the receipt
          <input name="receipt_name" className={field} defaultValue={defaultName} maxLength={160} required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--color-text)]">
          TIN (optional)
          <input name="tin" className={field} maxLength={20} inputMode="numeric" placeholder="e.g. 0012345678" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--color-text)]">
          Anything we should know? (optional)
          <textarea name="note" className={field} rows={2} maxLength={500} />
        </label>
        {state.error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-brand)] px-7 text-[15px] font-medium text-[var(--color-on-brand)] transition-all hover:-translate-y-px hover:bg-[var(--color-brand-hover)] disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Sending…" : "Request receipt"}
        </button>
      </form>
    </section>
  );
}
