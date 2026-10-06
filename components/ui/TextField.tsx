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
      <label htmlFor={name} className="text-[13.5px] font-bold text-[var(--color-text)]">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`w-full rounded-[var(--radius-input)] border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[15px] text-[var(--color-text)] transition-colors hover:border-[var(--color-border-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(37,99,235,0.14)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-accent)] ${
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
