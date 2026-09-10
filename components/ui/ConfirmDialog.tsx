"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";

type ConfirmResult = { error?: string } | void;

type Props = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  confirmingLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  /** Return { error } to keep the dialog open and show it; return
   * void/undefined on success -- the caller is responsible for closing
   * (setting `open` to false) once its own state update is done. */
  onConfirm: () => Promise<ConfirmResult>;
};

/** Pivotroom's reusable replacement for window.confirm() on every
 * destructive availability action (Skip, Remove). One component, one
 * consistent look, instead of a native browser dialog per action. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmingLabel = "Working...",
  destructive = true,
  onCancel,
  onConfirm,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (result && "error" in result && result.error) {
        setError(result.error);
      }
    });
  }

  function handleCancel() {
    if (isPending) return;
    setError(null);
    onCancel();
  }

  return (
    <Modal open={open} onClose={handleCancel} title={title} closeOnEscape={!isPending}>
      <div className="text-sm text-[var(--color-text-muted)]">{description}</div>
      {error ? <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            destructive
              ? "bg-[var(--color-danger)] hover:opacity-90"
              : "bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)]"
          }`}
        >
          {isPending ? confirmingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
