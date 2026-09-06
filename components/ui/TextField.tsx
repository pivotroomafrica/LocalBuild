import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};

export function TextField({ label, name, error, hint, className = "", ...rest }: Props) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-[var(--color-text)]">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-brand)] ${
          error ? "border-[var(--color-danger)]" : ""
        } ${className}`}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-[var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
