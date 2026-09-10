"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Set false while a mutation is in flight so a stray Escape/backdrop
   * click can't abandon a request the user already confirmed. */
  closeOnEscape?: boolean;
};

/** Generic centered dialog, rendered via a portal so it always sits above
 * the rest of the page regardless of where it's mounted. Pivotroom's own
 * replacement for window.confirm()/window.alert() -- every availability
 * destructive action and the Add Extra Time flow build on this instead of
 * a native browser dialog. */
export function Modal({ open, onClose, title, children, closeOnEscape = true }: Props) {
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeOnEscape, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pivotroom-modal-title"
        className="w-full max-w-md rounded-lg bg-[var(--color-surface)] p-5 shadow-lg"
      >
        <h2 id="pivotroom-modal-title" className="text-sm font-semibold text-[var(--color-text)]">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
